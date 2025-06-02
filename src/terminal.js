const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { ipcRenderer } = require('electron');

class TerminalManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container element with ID '${containerId}' not found`);
    }


    // Initialize terminal
    this.term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: '#1e1e1e',
        foreground: '#f0f0f0',
        cursor: '#f0f0f0',
        selection: 'rgba(255, 255, 255, 0.3)'
      }
    });

    // Add fit addon
    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);

    // Open terminal in container
    this.term.open(this.container);
    this.fitAddon.fit();

    // Handle window resize
    window.addEventListener('resize', () => this.fitAddon.fit());

    // Initialize PTY
    this.pty = null;
    this.setupPty();
  }

  async setupPty() {
    try {
      // Request the main process to create a new PTY
      this.pty = await window.electronAPI.createPty();
      
      // Handle data from PTY
      window.electronAPI.onPtyData((event, data) => {
        this.term.write(data);
      });

      // Handle terminal input
      this.term.onData(data => {
        window.electronAPI.writeToPty(data);
      });

      // Handle terminal resize
      this.term.onResize(size => {
        window.electronAPI.resizePty({
          cols: size.cols,
          rows: size.rows
        });
      });

      // Initial resize
      this.fitAddon.fit();
      
    } catch (error) {
      console.error('Failed to initialize terminal:', error);
      this.term.writeln('Failed to initialize terminal. Please check the console for details.');
    }
  }

  focus() {
    this.term.focus();
  }

  clear() {
    this.term.clear();
  }

  destroy() {
    this.term.dispose();
    if (this.pty) {
      window.electronAPI.destroyPty();
      this.pty = null;
    }
  }
}

module.exports = TerminalManager;
