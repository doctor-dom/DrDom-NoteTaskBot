/**
 * Shared: generate current-page PNG and attach it to the page-scoped parent task.
 */

import {log, logError} from './debug';
import {fileBaseName} from './taskTitles';
import {generatePageContextPng, deletePageContextPng} from './pageContextImage';
import {ensureParentTask, attachPageImageToParent} from '../api/todoist';

/**
 * Ensure the page parent exists, render the page PNG, upload, and comment on the parent.
 */
export async function attachCurrentPageContext({
  projectId,
  filePath,
  pageNum,
  parentId,
  parentAlreadyEnsured,
}) {
  let parent = parentId ? {id: parentId} : null;
  let reused = !!parentId;

  if (!parentAlreadyEnsured || !parentId) {
    const ensured = await ensureParentTask(projectId, filePath, pageNum);
    parent = ensured.task;
    reused = ensured.reused;
  }

  const id = parent?.id;
  if (!id) {
    throw new Error('No parent task to attach page context to');
  }

  const pngPath = await generatePageContextPng(filePath, pageNum);
  try {
    const {uploaded, comment} = await attachPageImageToParent({
      parentId: id,
      projectId,
      pngPath,
      pageNum,
      noteBase: fileBaseName(filePath),
    });
    log('Context', `Attached page ${pageNum} image to parent ${id}`);
    return {parent, reused, uploaded, comment};
  } catch (err) {
    logError('Context', err);
    throw err;
  } finally {
    await deletePageContextPng(pngPath);
  }
}
