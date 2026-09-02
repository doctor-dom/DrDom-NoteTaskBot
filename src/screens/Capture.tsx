/**
 * Capture — auto-run lasso OCR and add a subtask under the note's parent.
 */

import React, {useEffect, useState} from 'react';
import {View, Text, Pressable, StyleSheet, ScrollView} from 'react-native';
import {PluginCommAPI} from 'sn-plugin-lib';
import {closePlugin} from '../utils/closePlugin';
import {loadConfig, getConfigSource} from '../utils/config';
import {log, logError, getEntries, exportLog, startLogSession} from '../utils/debug';
import {ensureCapturePermissions} from '../utils/permissions';
import {recognizeLassoElements} from '../utils/ocr';
import {
  waitForButtonPressLasso,
  clearLassoCache,
  isCaptureCurrent,
  lassoFingerprint,
} from '../utils/lassoCache';
import {pickLassoSource} from '../utils/lassoSelect';
import {estimateLassoLocation} from '../utils/lassoLocation';
import {
  buildParentTitle,
  buildSubtaskFromOcr,
} from '../utils/taskTitles';
import {attachCurrentPageContext} from '../utils/attachPageContext';
import {
  setConfigLoader,
  getTargetProject,
  ensureParentTask,
  createParentTask,
  createSubtasks,
  testConnection,
} from '../api/todoist';

type Phase = 'working' | 'review' | 'error';

type CaptureReview = {
  ocrText: string;
  projectName: string;
  projectId: string;
  parentTitle: string;
  parentId: string;
  parentReused: boolean;
  parentRecreated: boolean;
  lassoLocation: string;
  alreadyExisted: boolean;
  filePath: string;
  pageNum: number;
  dueString: string | null;
  clientPriority: number | null;
  corrections: Array<{from: string; to: string}>;
  markupFromBrackets: boolean;
  subtasks: Array<{id: string; content: string}>;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

function assertCurrent(generation: number) {
  if (!isCaptureCurrent(generation)) {
    const err = new Error('superseded');
    (err as any).superseded = true;
    throw err;
  }
}

async function readLassoSelection(generation: number) {
  const lastFp = global.__noteTaskBotLastCaptureFp || '';
  const snapshot = await waitForButtonPressLasso();
  assertCurrent(generation);

  const cachedLasso = snapshot?.lasso;
  const cachedFp =
    cachedLasso?.success && cachedLasso.result?.length
      ? lassoFingerprint(cachedLasso.result)
      : snapshot?.fingerprint || '';
  const cachedOk = !!(cachedLasso?.success && cachedLasso.result?.length);
  const cachedIsThisPress = snapshot?.generation === generation && generation > 0;

  let fresh: any = null;
  let freshFp = '';
  try {
    fresh = await withTimeout(
      PluginCommAPI.getLassoElements(),
      10000,
      'getLassoElements',
    );
    assertCurrent(generation);
    freshFp = fresh?.success && fresh.result?.length ? lassoFingerprint(fresh.result) : '';
  } catch (e: any) {
    if (e?.superseded) throw e;
    log('Capture', `Fresh lasso failed (${e.message})`);
  }

  const freshOk = !!(fresh?.success && fresh.result?.length);
  const source = pickLassoSource({
    lastFp,
    cachedOk,
    cachedFp,
    cachedIsThisPress,
    freshOk,
    freshFp,
  });

  log(
    'Capture',
    `Lasso pick=${source} gen=${generation} last=[${lastFp}] ` +
      `cache=[${cachedFp}] thisPress=${cachedIsThisPress} fresh=[${freshFp}]`,
  );

  if (source === 'cache') {
    return {
      lasso: cachedLasso,
      rect: snapshot?.rect || null,
      usedCache: true,
      fingerprint: cachedFp,
    };
  }
  if (source === 'fresh') {
    return {lasso: fresh, rect: null, usedCache: false, fingerprint: freshFp};
  }
  if (source === 'already-captured') {
    throw new Error(
      'This handwriting was already sent to Todoist. Close, lasso different text, then tap -> Todoist again.',
    );
  }
  throw new Error('No elements selected. Lasso handwriting first.');
}

function ReviewPanel({
  review,
  onClose,
  onAddContext,
  contextStatus,
  contextMessage,
}: {
  review: CaptureReview;
  onClose: () => void;
  onAddContext: () => void;
  contextStatus: 'idle' | 'working' | 'done' | 'error';
  contextMessage: string;
}) {
  const parentNote = review.parentRecreated
    ? 'Parent was recreated (previous missing)'
    : review.parentReused
      ? 'Added under existing note parent'
      : 'Created note parent';

  const hasMarkup = !!(review.dueString || review.clientPriority != null);
  const metaParts = [
    review.dueString ? `Due: ${review.dueString}` : null,
    review.clientPriority != null ? `Priority: !!${review.clientPriority}` : null,
    review.markupFromBrackets ? 'from [brackets]' : null,
  ].filter(Boolean);

  const correctionHint =
    review.corrections?.length > 0
      ? `OCR: ${review.corrections.map(c => `${c.from} → ${c.to}`).join(', ')}`
      : null;

  return (
    <ScrollView style={s.reviewScroll} contentContainerStyle={s.reviewContent}>
      <Text style={s.sectionTitle}>Recognized text</Text>
      <View style={s.block}>
        <Text style={s.ocrText}>{review.ocrText}</Text>
      </View>

      <Text style={s.sectionTitle}>Todoist project</Text>
      <Text style={s.bodyText}>{review.projectName}</Text>

      <Text style={s.sectionTitle}>Parent task (file | path | page)</Text>
      <View style={s.block}>
        <Text style={s.parentText}>{review.parentTitle}</Text>
        <Text style={s.hintText}>
          Location: {review.lassoLocation}
          {' · '}
          {parentNote}
        </Text>
      </View>

      <Text style={s.sectionTitle}>
        Subtask{review.subtasks.length === 1 ? '' : `s (${review.subtasks.length})`}
      </Text>
      {review.subtasks.map((task, i) => (
        <View key={task.id || String(i)} style={s.subtaskRow}>
          <Text style={s.subtaskBullet}>{i + 1}.</Text>
          <Text style={s.subtaskText}>{task.content}</Text>
        </View>
      ))}
      {hasMarkup ? (
        <Text style={s.hintText}>{metaParts.join(' · ')}</Text>
      ) : (
        <Text style={s.hintText}>
          No due or priority parsed. Put them in [brackets], e.g. [tomorrow !!1].
        </Text>
      )}
      {correctionHint ? <Text style={s.hintText}>{correctionHint}</Text> : null}
      {review.alreadyExisted ? (
        <Text style={s.hintText}>This subtask was already on the parent (not duplicated).</Text>
      ) : null}

      <Text style={s.hintText}>
        Close, lasso the next item, then tap -> Todoist to add another subtask under this note.
      </Text>

      {contextMessage ? <Text style={s.hintText}>{contextMessage}</Text> : null}
      {!review.filePath ? (
        <Text style={s.hintText}>Page context unavailable (missing note path).</Text>
      ) : null}

      <Pressable
        style={[s.btn, s.btnSecondary, (contextStatus === 'working' || contextStatus === 'done' || !review.filePath) && s.btnDisabled]}
        disabled={contextStatus === 'working' || contextStatus === 'done' || !review.filePath}
        onPress={onAddContext}
      >
        <Text style={s.btnText}>
          {contextStatus === 'working'
            ? 'Adding context...'
            : contextStatus === 'done'
              ? 'Context added'
              : 'Add context'}
        </Text>
      </Pressable>

      <Pressable style={[s.btn, s.btnPrimary]} onPress={onClose}>
        <Text style={[s.btnText, s.btnPrimaryText]}>Close</Text>
      </Pressable>
    </ScrollView>
  );
}

export default function Capture() {
  const [phase, setPhase] = useState<Phase>('working');
  const [status, setStatus] = useState('Starting...');
  const [review, setReview] = useState<CaptureReview | null>(null);
  const [contextStatus, setContextStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [contextMessage, setContextMessage] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);

  useEffect(() => {
    setConfigLoader(loadConfig);
    runCapture();
  }, []);

  const runCapture = async (opts?: {force?: boolean}) => {
    const generation = global.__noteTaskBotLassoGen || 0;
    if (
      !opts?.force &&
      generation > 0 &&
      global.__noteTaskBotCaptureStartedGen === generation
    ) {
      log('Capture', `Already started gen=${generation}; skip duplicate mount`);
      return;
    }
    global.__noteTaskBotCaptureStartedGen = generation;
    startLogSession(`capture-gen-${generation}`);
    setPhase('working');
    setReview(null);
    try {
      setStatus('Requesting device permissions...');
      await ensureCapturePermissions();
      assertCurrent(generation);

      setStatus('Loading config...');
      const config = await loadConfig();
      assertCurrent(generation);
      if (!config.apiToken) {
        throw new Error(
          'No Todoist API token. Connect via USB and edit MyStyle/NoteTaskBot/notetaskbot-config.json ' +
          '(set apiToken). If SuperTask is already configured, rebuild with the latest plugin to reuse that token.',
        );
      }
      log('Capture', `Config source: ${getConfigSource()}`);

      setStatus('Reading lasso selection...');
      const {lasso, rect: lassoRect, fingerprint: selectionFp} = await readLassoSelection(generation);

      if (!lasso?.success || !lasso.result?.length) {
        throw new Error('No elements selected. Lasso handwriting first.');
      }

      setStatus('Checking Todoist...');
      const conn = await testConnection();
      assertCurrent(generation);
      if (!conn.hasTargetProject) {
        throw new Error(
          `Todoist project not found (id=${conn.targetProjectId}). ` +
          'Update targetProjectId in notetaskbot-config.json.',
        );
      }
      log('Capture', `Todoist OK: project "${conn.targetProjectName}"`);

      setStatus('Recognizing handwriting...');
      const ocr = await recognizeLassoElements(lasso.result, msg => log('Capture', msg));
      assertCurrent(generation);
      if (!ocr.success || !ocr.text) {
        throw new Error('Could not recognize handwriting. Try clearer text.');
      }

      let filePath = ocr.pageContext?.filePath || '';
      if (!filePath) {
        try {
          const fp = await withTimeout(PluginCommAPI.getCurrentFilePath(), 3000, 'getCurrentFilePath');
          filePath = fp?.result || '';
          if (filePath) log('Capture', `Recovered filePath: ${filePath}`);
        } catch (e: any) {
          log('Capture', `getCurrentFilePath fallback failed: ${e.message}`);
        }
      }

      const pageNum = ocr.pageContext?.pageNum ?? 1;
      const parentTitlePreview = buildParentTitle(filePath, pageNum);
      const pageSize = ocr.pageContext?.pageSize || {width: 1404, height: 1872};
      const lassoLocation = estimateLassoLocation(lasso.result, pageSize, lassoRect);
      const subtask = buildSubtaskFromOcr(ocr.text, pageNum, lassoLocation);
      log(
        'Capture',
        `Parent="${parentTitlePreview}" subtask="${subtask.content.slice(0, 80)}" ` +
          `due=${subtask.dueString || 'none'} priority=${subtask.priority ?? 'none'} ` +
          `brackets=${subtask.markupFromBrackets} corrections=${(subtask.corrections || []).length}`,
      );

      setStatus('Connecting to Todoist...');
      const project = await getTargetProject();
      assertCurrent(generation);

      setStatus(`Finding parent "${parentTitlePreview}"...`);
      const recreateParent = () => createParentTask(project.id, filePath, pageNum);
      const {task: parent, reused, projectTasks} = await ensureParentTask(project.id, filePath, pageNum);
      assertCurrent(generation);
      let parentId = parent?.id;
      if (!parentId) throw new Error('Failed to create parent task');

      setStatus(reused ? 'Adding subtask to note parent...' : 'Adding subtask...');
      const {created, parent: finalParent, parentRecreated, skipped} = await createSubtasks(
        project.id,
        parent,
        [
          {
            content: subtask.content,
            dueString: subtask.dueString,
            priority: subtask.priority,
          },
        ],
        recreateParent,
        {projectTasks},
      );
      assertCurrent(generation);

      if (created.length === 0 && skipped.length === 0) {
        throw new Error('No new subtasks were created.');
      }

      parentId = finalParent?.id || parentId;
      const parentTitle = finalParent?.content || parentTitlePreview;
      const alreadyExisted = created.length === 0 && skipped.length > 0;
      const subtasks = alreadyExisted
        ? skipped.map((t, i) => ({id: t.id || `existing-${i}`, content: t.content}))
        : created.map(t => ({id: t.id, content: t.content}));

      global.__noteTaskBotLastCaptureFp = selectionFp;
      clearLassoCache();

      setReview({
        ocrText: ocr.text,
        projectName: project.name || conn.targetProjectName || project.id,
        projectId: project.id,
        parentTitle,
        parentId,
        parentReused: !!reused && !parentRecreated,
        parentRecreated: !!parentRecreated,
        lassoLocation,
        alreadyExisted,
        dueString: subtask.dueString,
        clientPriority: subtask.clientPriority,
        corrections: subtask.corrections || [],
        markupFromBrackets: !!subtask.markupFromBrackets,
        subtasks,
        filePath,
        pageNum,
      });
      setContextStatus('idle');
      setContextMessage('');
      setPhase('review');
      setStatus(
        alreadyExisted
          ? 'Subtask already exists on this note'
          : parentRecreated
            ? 'Added subtask under recreated parent'
            : reused
              ? 'Added subtask to note parent'
              : 'Added to Todoist',
      );
      log(
        'Capture',
        `Review: ${alreadyExisted ? 'existing' : 'new'} subtask under "${parentTitle}"`,
      );

      try {
        await PluginCommAPI.setLassoBoxState(2);
        log('Capture', 'Cleared lasso selection for next capture');
      } catch (e: any) {
        log('Capture', `setLassoBoxState failed: ${e.message}`);
      }
    } catch (err: any) {
      if (err?.superseded || err?.message === 'superseded') {
        log('Capture', `Capture gen=${generation} superseded; stopping`);
        return;
      }
      logError('Capture', err);
      setPhase('error');
      setStatus(err.message || 'Capture failed');
    }
  };

  const handleClose = () => closePlugin();

  const handleAddContext = async () => {
    if (!review?.parentId || !review.filePath) {
      setContextStatus('error');
      setContextMessage('Page context unavailable (missing note path).');
      return;
    }
    setContextStatus('working');
    setContextMessage('Generating page image...');
    try {
      await attachCurrentPageContext({
        projectId: review.projectId,
        filePath: review.filePath,
        pageNum: review.pageNum,
        parentId: review.parentId,
        parentAlreadyEnsured: true,
      });
      setContextStatus('done');
      setContextMessage('Page image added to parent');
    } catch (err: any) {
      setContextStatus('error');
      setContextMessage(err?.message || 'Failed to add page context');
    }
  };

  const handleShowLog = async () => {
    setLogLines(getEntries());
    setShowLog(true);
  };

  const handleUploadLog = async () => {
    const result = await exportLog();
    setLogLines([...getEntries(), result]);
  };

  if (showLog) {
    return (
      <View style={s.overlay}>
        <View style={s.panel}>
          <Text style={s.title}>Debug Log</Text>
          <ScrollView style={s.logScroll}>
            {logLines.map((line, i) => (
              <Text key={i} style={s.logLine}>{line}</Text>
            ))}
          </ScrollView>
          <View style={s.row}>
            <Pressable style={s.btn} onPress={handleUploadLog}>
              <Text style={s.btnText}>Upload</Text>
            </Pressable>
            <Pressable style={s.btn} onPress={() => setShowLog(false)}>
              <Text style={s.btnText}>Back</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={s.overlay}>
      <Pressable style={s.backdrop} onPress={phase === 'review' ? undefined : handleClose} />
      <View style={[s.panel, phase === 'review' && s.panelTall]}>
        <Text style={s.title}>NoteTaskBot</Text>

        {phase === 'working' && (
          <Text style={s.status}>{status}</Text>
        )}

        {phase === 'review' && review && (
          <>
            <Text style={s.status}>{status}</Text>
            <ReviewPanel
              review={review}
              onClose={handleClose}
              onAddContext={handleAddContext}
              contextStatus={contextStatus}
              contextMessage={contextMessage}
            />
          </>
        )}

        {phase === 'error' && (
          <>
            <Text style={s.status}>{status}</Text>
            <View style={s.row}>
              <Pressable style={s.btn} onPress={() => runCapture({force: true})}>
                <Text style={s.btnText}>Retry</Text>
              </Pressable>
              <Pressable style={s.btn} onPress={handleClose}>
                <Text style={s.btnText}>Close</Text>
              </Pressable>
            </View>
          </>
        )}

        {phase !== 'review' && (
          <Pressable style={s.linkBtn} onPress={handleShowLog}>
            <Text style={s.linkText}>Log</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    width: 520,
    maxWidth: '92%',
    maxHeight: '88%',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000',
    padding: 24,
  },
  panelTall: {
    flexShrink: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  status: {
    fontSize: 16,
    color: '#000000',
    marginBottom: 12,
    lineHeight: 22,
  },
  reviewScroll: {
    flexGrow: 0,
    maxHeight: 520,
  },
  reviewContent: {
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    marginTop: 8,
    marginBottom: 6,
  },
  block: {
    borderWidth: 1,
    borderColor: '#000000',
    padding: 10,
    marginBottom: 4,
  },
  ocrText: {
    fontSize: 14,
    color: '#000000',
    lineHeight: 20,
  },
  bodyText: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 4,
    lineHeight: 20,
  },
  parentText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 21,
  },
  hintText: {
    fontSize: 12,
    color: '#000000',
    marginTop: 6,
    lineHeight: 16,
  },
  subtaskRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingRight: 4,
  },
  subtaskBullet: {
    width: 22,
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  subtaskText: {
    flex: 1,
    fontSize: 14,
    color: '#000000',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#000000',
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: '#ffffff',
    marginTop: 16,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnPrimary: {
    backgroundColor: '#000000',
    marginTop: 16,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  btnPrimaryText: {
    color: '#ffffff',
  },
  linkBtn: {
    marginTop: 16,
    alignSelf: 'center',
    padding: 8,
  },
  linkText: {
    fontSize: 14,
    textDecorationLine: 'underline',
    color: '#000000',
  },
  logScroll: {
    maxHeight: 320,
    marginVertical: 12,
  },
  logLine: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#000000',
    marginBottom: 3,
  },
});
