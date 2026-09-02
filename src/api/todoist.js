/**
 * Todoist API v1 client for NoteTaskBot
 */

import {log} from '../utils/debug';
import {buildParentTitle} from '../utils/taskTitles';

export {buildParentTitle} from '../utils/taskTitles';

const TODOIST_API = 'https://api.todoist.com/api/v1';
/** Fallback only when config omits targetProjectId — prefer setting it in notetaskbot-config.json. */
export const DEFAULT_TARGET_PROJECT_ID = '6fVCFGxCf6MVJwm8';

let _configLoader = null;

export function setConfigLoader(loader) {
  _configLoader = loader;
}

async function todoistFetch(path, options = {}) {
  if (!_configLoader) {
    throw new Error('Config loader not set');
  }
  const config = await _configLoader();
  if (!config.apiToken) {
    throw new Error('No API token configured. Edit MyStyle/NoteTaskBot/notetaskbot-config.json');
  }

  const url = `${TODOIST_API}${path}`;
  const method = options.method || 'GET';
  log('API', `${method} ${path}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Todoist ${response.status}: ${text}`);
    err.status = response.status;
    err.body = text;
    throw err;
  }
  if (response.status === 204) return null;
  return response.json();
}

function unwrapResult(result) {
  if (Array.isArray(result)) return result;
  if (result?.results) return result.results;
  return [];
}

async function fetchAllPages(path, params = '') {
  let allItems = [];
  let cursor = null;

  do {
    const sep = params || cursor ? '?' : '';
    const cursorParam = cursor ? `cursor=${encodeURIComponent(cursor)}` : '';
    const joinChar = params && cursorParam ? '&' : '';
    const url = `${path}${sep}${params}${joinChar}${cursorParam}`;
    const result = await todoistFetch(url);
    allItems = allItems.concat(unwrapResult(result));
    cursor = result?.next_cursor || null;
  } while (cursor);

  return allItems;
}

export async function getProjects() {
  return fetchAllPages('/projects');
}

export async function getTargetProject() {
  const config = await _configLoader();
  const projectId = config.targetProjectId || DEFAULT_TARGET_PROJECT_ID;
  log('API', `Using target project id=${projectId}`);

  const projects = await getProjects();
  const match = projects.find(p => p.id === projectId);
  if (!match) {
    log('API', `WARNING: project id=${projectId} not found in account`);
    return {id: projectId, name: null, missing: true};
  }
  return {id: projectId, name: match.name, missing: false};
}

function taskId(task) {
  return task?.id ?? task?.task_id ?? task?.taskId ?? null;
}

function isCompleted(task) {
  return task?.is_completed === true || task?.checked === true;
}

function isOpenTopLevel(task) {
  if (!task || isCompleted(task)) return false;
  const parent = task.parent_id ?? task.parentId ?? null;
  return !parent;
}

function rememberParentId(title, id) {
  if (!title || !id) return;
  global.__noteTaskBotParentIds = global.__noteTaskBotParentIds || {};
  global.__noteTaskBotParentIds[title] = id;
}

export async function listProjectTasks(projectId) {
  return fetchAllPages('/tasks', `project_id=${encodeURIComponent(projectId)}`);
}

function parseCreatedTask(result, content) {
  if (!result || typeof result !== 'object') {
    throw new Error(`Todoist returned empty response for "${content.slice(0, 40)}"`);
  }
  const id = taskId(result);
  if (!id) {
    throw new Error(
      `Todoist response missing task id for "${content.slice(0, 40)}": ${JSON.stringify(result).slice(0, 120)}`,
    );
  }
  return {...result, id, content: result.content || content};
}

export async function getTask(id) {
  return todoistFetch(`/tasks/${id}`);
}

function isDueStringError(err) {
  if (err?.status !== 400) return false;
  const msg = `${err?.message || ''} ${err?.body || ''}`.toLowerCase();
  return (
    msg.includes('due') ||
    msg.includes('due_string') ||
    msg.includes('date') ||
    msg.includes('invalid')
  );
}

/**
 * Create a task. Optional dueString / priority (API 1–4, 4=urgent).
 * If due_string is rejected (400), retries once without due so capture still succeeds.
 */
export async function createTask({
  content,
  projectId,
  parentId,
  dueString,
  priority,
  dueLang = 'en',
}) {
  const body = {content};
  if (projectId) body.project_id = projectId;
  if (parentId) body.parent_id = parentId;
  if (dueString) {
    body.due_string = dueString;
    body.due_lang = dueLang || 'en';
  }
  // Omit default/unset priority (API 1 = natural / lowest).
  if (priority != null && priority >= 2 && priority <= 4) {
    body.priority = priority;
  }

  const meta = [
    parentId ? 'subtask' : null,
    dueString ? `due="${dueString}"` : null,
    body.priority ? `priority=${body.priority}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  log('API', `Creating task: "${content.slice(0, 40)}"${meta ? ` (${meta})` : ''}`);

  try {
    const result = await todoistFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const task = parseCreatedTask(result, content);
    log('API', `Created id=${task.id}`);
    return task;
  } catch (err) {
    if (body.due_string && isDueStringError(err)) {
      log(
        'API',
        `due_string rejected (${err.message}); retrying without due for "${content.slice(0, 40)}"`,
      );
      const retryBody = {...body};
      delete retryBody.due_string;
      delete retryBody.due_lang;
      const result = await todoistFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify(retryBody),
      });
      const task = parseCreatedTask(result, content);
      log('API', `Created id=${task.id} (without due)`);
      return task;
    }
    throw err;
  }
}

/**
 * Always create a new parent: "File Name | Local Relative Path".
 */
export async function createParentTask(projectId, filePath, pageNum = 1) {
  const title = buildParentTitle(filePath, pageNum);
  log('API', `Creating parent: ${title}`);
  const task = await createTask({content: title, projectId});
  rememberParentId(title, taskId(task));
  return {task, reused: false};
}

/**
 * Find an open top-level task with the note's path+page title, or create one.
 * Same note path + page → same parent, so later lassos on that page append subtasks.
 */
export async function ensureParentTask(projectId, filePath, pageNum = 1) {
  const title = buildParentTitle(filePath, pageNum);
  const cachedId = global.__noteTaskBotParentIds?.[title];
  if (cachedId) {
    try {
      const task = await getTask(cachedId);
      if (task && isOpenTopLevel(task) && (task.content || title) === title) {
        log('API', `Reusing session parent id=${cachedId} "${title}"`);
        const projectTasks = await listProjectTasks(projectId);
        return {
          task: {...task, id: taskId(task), content: task.content || title},
          reused: true,
          projectTasks,
        };
      }
    } catch (err) {
      log('API', `Cached parent ${cachedId} not usable (${err.message}); searching project`);
    }
  }

  log('API', `Looking up parent "${title}" in project ${projectId}`);
  const projectTasks = await listProjectTasks(projectId);
  const match = projectTasks.find(t => isOpenTopLevel(t) && t.content === title);
  if (match) {
    const id = taskId(match);
    rememberParentId(title, id);
    log('API', `Reusing existing parent id=${id} "${title}"`);
    return {task: {...match, id, content: match.content || title}, reused: true, projectTasks};
  }

  const {task} = await createParentTask(projectId, filePath, pageNum);
  return {task, reused: false, projectTasks};
}

function isParentMissingError(err) {
  const status = err?.status;
  const msg = `${err?.message || ''} ${err?.body || ''}`.toLowerCase();
  if (status === 404 || status === 400) {
    if (
      msg.includes('parent') ||
      msg.includes('not found') ||
      msg.includes('invalid') ||
      msg.includes('does not exist')
    ) {
      return true;
    }
  }
  // Some Todoist responses nest the reason without a clear status on our Error.
  if (msg.includes('parent_id') && (msg.includes('invalid') || msg.includes('not found'))) {
    return true;
  }
  return false;
}

function existingSubtaskContents(projectTasks, parentId) {
  const id = String(parentId);
  const contents = new Set();
  if (!Array.isArray(projectTasks) || !parentId) return contents;
  for (const t of projectTasks) {
    const p = t?.parent_id ?? t?.parentId;
    if (p != null && String(p) === id && t.content) {
      contents.add(t.content);
    }
  }
  return contents;
}

function normalizeSubtaskSpec(line) {
  if (line && typeof line === 'object') {
    const content = String(line.content || '').trim();
    return {
      content,
      dueString: line.dueString || line.due_string || null,
      priority: line.priority != null ? line.priority : null,
    };
  }
  return {content: String(line || '').trim(), dueString: null, priority: null};
}

/**
 * Create subtasks under parentId.
 * `lines` may be strings or {content, dueString?, priority?} objects.
 * If the parent was deleted / is invalid, recreateParent() is called and remaining lines retry.
 *
 * @returns {{created: Array, parent: object, parentRecreated: boolean, skipped: Array}}
 */
export async function createSubtasks(projectId, parent, lines, recreateParent, options = {}) {
  let currentParent = parent;
  let parentId = taskId(currentParent);
  let parentRecreated = false;
  const created = [];
  const skipped = [];
  const alreadyHave = existingSubtaskContents(options.projectTasks, parentId);

  // Proactive check: parent may already be gone before the first subtask.
  if (parentId && typeof recreateParent === 'function') {
    try {
      await getTask(parentId);
    } catch (err) {
      if (isParentMissingError(err) || err?.status === 404) {
        log('API', `Parent ${parentId} missing before subtasks; recreating`);
        const {task} = await recreateParent();
        currentParent = task;
        parentId = taskId(task);
        parentRecreated = true;
        if (!parentId) throw new Error('Failed to recreate parent task');
      } else {
        throw err;
      }
    }
  }

  for (const line of lines) {
    const spec = normalizeSubtaskSpec(line);
    if (!spec.content) continue;

    if (alreadyHave.has(spec.content)) {
      log('API', `Subtask already exists under parent: "${spec.content.slice(0, 60)}"`);
      skipped.push({content: spec.content, reason: 'exists'});
      continue;
    }

    const createArgs = {
      content: spec.content,
      projectId,
      parentId,
      dueString: spec.dueString,
      priority: spec.priority,
    };

    try {
      const task = await createTask(createArgs);
      created.push(task);
      alreadyHave.add(spec.content);
    } catch (err) {
      if (typeof recreateParent === 'function' && isParentMissingError(err)) {
        log('API', `Parent gone while creating subtasks; recreating and retrying "${spec.content.slice(0, 40)}"`);
        const {task: newParent} = await recreateParent();
        currentParent = newParent;
        parentId = taskId(newParent);
        parentRecreated = true;
        if (!parentId) throw new Error('Failed to recreate parent task');

        const task = await createTask({...createArgs, parentId});
        created.push(task);
        alreadyHave.add(spec.content);
        continue;
      }
      throw err;
    }
  }

  return {created, parent: currentParent, parentRecreated, skipped};
}


/**
 * Upload a local file to Todoist (multipart). Do not use todoistFetch — that forces JSON Content-Type.
 */
export async function uploadFile(localPath, fileName, projectId) {
  if (!_configLoader) throw new Error('Config loader not set');
  const config = await _configLoader();
  if (!config.apiToken) {
    throw new Error('No API token configured. Edit MyStyle/NoteTaskBot/notetaskbot-config.json');
  }

  const name = fileName || localPath.split('/').pop() || 'page-context.png';
  const url = `${TODOIST_API}/uploads`;
  log('API', `POST /uploads name=${name}`);

  const form = new FormData();
  form.append('file', {
    uri: localPath.startsWith('file://') ? localPath : `file://${localPath}`,
    type: 'image/png',
    name,
  });
  if (projectId) form.append('project_id', String(projectId));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Todoist ${response.status}: ${text}`);
    err.status = response.status;
    err.body = text;
    throw err;
  }

  const result = await response.json();
  const fileUrl = result.file_url || result.fileUrl;
  if (!fileUrl) {
    throw new Error(`Todoist upload missing file_url: ${JSON.stringify(result).slice(0, 120)}`);
  }
  log('API', `Uploaded file_url=${fileUrl}`);
  return {
    fileUrl,
    fileName: result.file_name || result.fileName || name,
    fileType: result.file_type || result.fileType || 'image/png',
    resourceType: result.resource_type || result.resourceType || 'file',
    raw: result,
  };
}

/**
 * Add a comment on a task, optionally with an attachment from uploadFile().
 */
export async function addTaskComment(taskIdValue, content, attachment) {
  const body = {
    task_id: taskIdValue,
    content: content || 'Page context',
  };
  if (attachment?.fileUrl) {
    body.attachment = {
      file_url: attachment.fileUrl,
      file_name: attachment.fileName,
      file_type: attachment.fileType,
      resource_type: attachment.resourceType || 'file',
    };
  }
  log('API', `POST /comments task=${taskIdValue}`);
  return todoistFetch('/comments', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Upload a page PNG and attach it as a comment on the parent task.
 */
export async function attachPageImageToParent({parentId, projectId, pngPath, pageNum, noteBase}) {
  const n = pageNum != null ? pageNum : 1;
  const base = String(noteBase || 'note').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const fileName = `${base}-page-${n}.png`;
  const uploaded = await uploadFile(pngPath, fileName, projectId);
  const comment = await addTaskComment(parentId, `Page ${n} context`, uploaded);
  return {uploaded, comment};
}
export async function testConnection() {
  const projects = await getProjects();
  const targetId = (await _configLoader()).targetProjectId || DEFAULT_TARGET_PROJECT_ID;
  const target = projects.find(p => p.id === targetId);
  return {
    ok: true,
    projectCount: projects.length,
    hasTargetProject: !!target,
    targetProjectId: targetId,
    targetProjectName: target?.name || null,
  };
}
