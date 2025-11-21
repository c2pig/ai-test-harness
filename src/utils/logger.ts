enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export class Logger {
  private static dateHeaderPrinted = false;

  private static get verbosity(): number {
    const level = process.env.LOG_VERBOSITY;
    return level ? parseInt(level, 10) : 1; // Default to 1 (INFO + WARN)
  }

  private static printDateHeaderIfNeeded(): void {
    if (!this.dateHeaderPrinted) {
      const date = new Date().toISOString().split('T')[0];
      console.log(`\n===== DATE:${date} =====`);
      this.dateHeaderPrinted = true;
    }
  }

  private static formatTime(): string {
    const now = new Date();
    return now.toTimeString().split(' ')[0]; // HH:MM:SS
  }

  static info(message: string, ...args: any[]) {
    if (this.verbosity >= LogLevel.INFO) {
      this.printDateHeaderIfNeeded();
      console.log(`${this.formatTime()} [INFO] ${message}`, ...args);
    }
  }

  static warn(message: string, ...args: any[]) {
    if (this.verbosity >= LogLevel.WARN) {
      this.printDateHeaderIfNeeded();
      console.warn(`${this.formatTime()} [WARN] 🔴 ${message}`, ...args);
    }
  }

  static error(message: string, ...args: any[]) {
    this.printDateHeaderIfNeeded();
    console.error(`${this.formatTime()} [ERROR] 🔴🔴 ${message}`, ...args);
  }

  static debug(message: string, ...args: any[]) {
    if (this.verbosity >= LogLevel.DEBUG) {
      this.printDateHeaderIfNeeded();
      console.log(`${this.formatTime()} [DEBUG] ${message}`, ...args);
    }
  }
}
