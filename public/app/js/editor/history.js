function cloneState(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

class EditorHistoryStack {
  constructor(limit = 80) {
    this.limit = Math.max(10, Math.floor(limit));
    this.undoStack = [];
    this.redoStack = [];
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  push(snapshot) {
    this.undoStack.push(cloneState(snapshot));
    if (this.undoStack.length > this.limit) {
      this.undoStack.splice(0, this.undoStack.length - this.limit);
    }
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 1;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo(currentSnapshot) {
    if (!this.canUndo()) return null;
    const current = this.undoStack.pop();
    this.redoStack.push(cloneState(currentSnapshot ?? current));
    return cloneState(this.undoStack[this.undoStack.length - 1]);
  }

  redo(currentSnapshot) {
    if (!this.canRedo()) return null;
    this.undoStack.push(cloneState(currentSnapshot));
    return cloneState(this.redoStack.pop());
  }
}

export {
  EditorHistoryStack
};
