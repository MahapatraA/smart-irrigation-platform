const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Unit tests run first — faster feedback loop
    return tests.sort((a, b) => {
      const aIsUnit = a.path.includes('/unit/');
      const bIsUnit = b.path.includes('/unit/');
      if (aIsUnit && !bIsUnit) return -1;
      if (!aIsUnit && bIsUnit) return 1;
      return a.path.localeCompare(b.path);
    });
  }
}

module.exports = CustomSequencer;