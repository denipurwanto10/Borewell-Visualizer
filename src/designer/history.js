// Phase 3 — Undo/redo history for the Well Designer, scoped per active well.
// Maintains predictable history with a size cap, integrated with autosave.

const MAX_HISTORY = 50;

export function createHistory(initialState) {
  let undoStack = [clone(initialState)];
  let redoStack = [];
  let index = 0;

  return {
    get current() {
      return undoStack[index];
    },
    get canUndo() {
      return index > 0;
    },
    get canRedo() {
      return index < undoStack.length - 1;
    },
    push(state) {
      // Drop any redo history when a new action is recorded
      redoStack = [];
      // Trim future history beyond current index
      undoStack = undoStack.slice(0, index + 1);
      undoStack.push(clone(state));
      index = undoStack.length - 1;
      // Cap history size: drop oldest entries
      while (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
        index--;
      }
    },
    undo() {
      if (!this.canUndo) return null;
      index--;
      redoStack.push(clone(undoStack[index + 1]));
      return clone(undoStack[index]);
    },
    redo() {
      if (!this.canRedo) return null;
      const next = clone(undoStack[index + 1]);
      index++;
      return next;
    },
    clear() {
      undoStack = [clone(initialState)];
      redoStack = [];
      index = 0;
    },
    replaceCurrent(state) {
      undoStack[index] = clone(state);
    },
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
