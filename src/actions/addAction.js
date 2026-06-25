const path = require('node:path');
const { normalizeBox } = require('../model');
const { readJson, writeJson } = require('../fs-utils');

function addAction(caseDir, input) {
  const actionsPath = path.join(caseDir, 'actions.json');
  const data = readJson(actionsPath);
  const existingActions = Array.isArray(data.actions) ? data.actions : [];
  const duplicate = existingActions.find(
    (action) =>
      action.page === input.page &&
      action.action === input.action &&
      (action.targetPage || '') === (input.targetPage || '') &&
      (action.value || '') === (input.value || ''),
  );
  if (duplicate) return duplicate;

  const nextIndex =
    existingActions.filter((action) => action.action === input.action).length + 1;

  const action = {
    id: `${input.action}_${nextIndex}`,
    page: input.page,
    action: input.action,
    ...(input.text ? { text: input.text } : {}),
    box: normalizeBox(input.box),
    ...(input.targetPage ? { targetPage: input.targetPage } : {}),
    ...(input.value ? { value: input.value } : {}),
  };

  const nextData = {
    ...data,
    actions: [...existingActions, action],
  };
  writeJson(actionsPath, nextData);
  return action;
}

module.exports = {
  addAction,
};
