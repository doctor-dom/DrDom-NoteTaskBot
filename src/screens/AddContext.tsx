/**
 * AddContext — attach a PNG of the current note page to the page-scoped parent task.
 * Opened from the plugin-tab button "add context -> Todoist" (no lasso required).
 */

import React, {useEffect, useState} from 'react';
import {View, Text, Pressable, StyleSheet, ScrollView} from 'react-native';
import {PluginCommAPI} from 'sn-plugin-lib';
import {closePlugin} from '../utils/closePlugin';
import {loadConfig, getConfigSource} from '../utils/config';
import {log, logError, getEntries, exportLog, startLogSession} from '../utils/debug';
import {ensureCapturePermissions} from '../utils/permissions';
import {buildParentTitle, fileBaseName} from '../utils/taskTitles';
import {toHostPageIndex} from '../utils/pageIndex';
import {attachCurrentPageContext} from '../utils/attachPageContext';
import {
  setConfigLoader,
  getTargetProject,
  testConnection,
} from '../api/todoist';

type Phase = 'working' | 'review' | 'error';

type ContextReview = {
  projectName: string;
  projectId: string;
  parentTitle: string;
  parentId: string;
  parentReused: boolean;
  filePath: string;
  pageNum: number;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      e => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function readNotePageContext() {
  let filePath = '';
  let pageNum = 1;

  try {
    const fp = await withTimeout(
      PluginCommAPI.getCurrentFilePath(),
      3000,
      'getCurrentFilePath',
    );
    filePath = fp?.result || '';
  } catch (e: any) {
    log('AddContext', `getCurrentFilePath failed: ${e.message}`);
  }

  try {
    const pn = await withTimeout(
      PluginCommAPI.getCurrentPageNum(),
      3000,
      'getCurrentPageNum',
    );
    pageNum = toHostPageIndex(pn?.result);
  } catch (e: any) {
    log('AddContext', `getCurrentPageNum failed: ${e.message}`);
  }

  return {filePath, pageNum};
}

export default function AddContext() {
  const [phase, setPhase] = useState<Phase>('working');
  const [status, setStatus] = useState('Starting...');
  const [review, setReview] = useState<ContextReview | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);

  useEffect(() => {
    setConfigLoader(loadConfig);
    runAttach();
  }, []);

  const runAttach = async () => {
    startLogSession('add-context');
    setPhase('working');
    setReview(null);
    try {
      setStatus('Requesting device permissions...');
      await ensureCapturePermissions();

      setStatus('Loading config...');
      const config = await loadConfig();
      if (!config.apiToken) {
        throw new Error(
          'No Todoist API token. Connect via USB and edit MyStyle/NoteTaskBot/notetaskbot-config.json ' +
            '(set apiToken).',
        );
      }
      log('AddContext', `Config source: ${getConfigSource()}`);

      setStatus('Checking Todoist...');
      const conn = await testConnection();
      if (!conn.hasTargetProject) {
        throw new Error(
          `Todoist project not found (id=${conn.targetProjectId}). ` +
            'Update targetProjectId in notetaskbot-config.json.',
        );
      }

      setStatus('Reading current note page...');
      const {filePath, pageNum} = await readNotePageContext();
      if (!filePath) {
        throw new Error('Could not resolve the current note path. Open a note and try again.');
      }

      const parentTitlePreview = buildParentTitle(filePath, pageNum);
      log(
        'AddContext',
        `file=${fileBaseName(filePath)} page=${pageNum} parent="${parentTitlePreview}"`,
      );

      setStatus('Connecting to Todoist...');
      const project = await getTargetProject();

      setStatus(`Attaching page ${pageNum} image to "${parentTitlePreview}"...`);
      const {parent, reused} = await attachCurrentPageContext({
        projectId: project.id,
        filePath,
        pageNum,
        parentAlreadyEnsured: false,
      });

      const parentId = parent?.id;
      if (!parentId) {
        throw new Error('Failed to create or find parent task for page context');
      }

      setReview({
        projectName: project.name || conn.targetProjectName || project.id,
        projectId: project.id,
        parentTitle: parent.content || parentTitlePreview,
        parentId,
        parentReused: !!reused,
        filePath,
        pageNum,
      });
      setPhase('review');
      setStatus(
        reused
          ? `Page ${pageNum} image added to existing parent`
          : `Page ${pageNum} image added (created parent)`,
      );
      log('AddContext', `Done under "${parent.content || parentTitlePreview}"`);
    } catch (err: any) {
      logError('AddContext', err);
      setPhase('error');
      setStatus(err?.message || 'Failed to add page context');
    }
  };

  const handleClose = () => closePlugin();

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
              <Text key={i} style={s.logLine}>
                {line}
              </Text>
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
        <Text style={s.title}>Add context</Text>
        <Text style={s.status}>{status}</Text>

        {phase === 'review' && review && (
          <ScrollView style={s.reviewScroll} contentContainerStyle={s.reviewContent}>
            <Text style={s.sectionTitle}>Todoist project</Text>
            <Text style={s.bodyText}>{review.projectName}</Text>

            <Text style={s.sectionTitle}>Parent task</Text>
            <View style={s.block}>
              <Text style={s.parentText}>{review.parentTitle}</Text>
              <Text style={s.hintText}>
                Page {review.pageNum}
                {' · '}
                {review.parentReused ? 'Existing parent' : 'Created parent'}
              </Text>
            </View>

            <Text style={s.hintText}>
              A PNG of this page was uploaded as a comment on the parent task.
            </Text>

            <Pressable style={[s.btn, s.btnPrimary]} onPress={handleClose}>
              <Text style={[s.btnText, s.btnPrimaryText]}>Close</Text>
            </Pressable>
          </ScrollView>
        )}

        {phase === 'error' && (
          <View style={s.row}>
            <Pressable style={s.btn} onPress={runAttach}>
              <Text style={s.btnText}>Retry</Text>
            </Pressable>
            <Pressable style={s.btn} onPress={handleClose}>
              <Text style={s.btnText}>Close</Text>
            </Pressable>
          </View>
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
