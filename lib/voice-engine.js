/**
 * Web Speech API wrapper for voice dictation.
 * Same approach as Delivery Hub's deliveryVoiceNotes LWC.
 */

export class VoiceEngine {
    constructor() {
        this._recognition = null;
        this._isListening = false;
        this._transcript = '';
        this._interim = '';
        this._onUpdate = null;
        this._onEnd = null;
        this._onError = null;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.supported = false;
            return;
        }
        this.supported = true;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            let finalText = '';
            let interimText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalText += event.results[i][0].transcript;
                } else {
                    interimText += event.results[i][0].transcript;
                }
            }
            if (finalText) {
                this._transcript = this._transcript
                    ? this._transcript + ' ' + finalText.trim()
                    : finalText.trim();
            }
            this._interim = interimText;
            if (this._onUpdate) {
                this._onUpdate(this._transcript, this._interim);
            }
        };

        recognition.onerror = (event) => {
            // 'no-speech' is common and not a real error — just means silence
            if (event.error === 'no-speech') { return; }

            this._isListening = false;
            if (this._onError) {
                let message = 'Microphone error';
                if (event.error === 'not-allowed') {
                    message = 'Microphone access denied. Check browser permissions.';
                } else if (event.error === 'network') {
                    message = 'Network error during speech recognition.';
                } else if (event.error === 'audio-capture') {
                    message = 'No microphone found. Check your audio device.';
                }
                this._onError(message, event.error);
            }
        };

        recognition.onend = () => {
            if (this._isListening) {
                // Auto-restart if user hasn't manually stopped
                try {
                    recognition.start();
                } catch (e) {
                    this._isListening = false;
                    if (this._onEnd) { this._onEnd(this._transcript); }
                }
            } else if (this._onEnd) {
                this._onEnd(this._transcript);
            }
        };

        this._recognition = recognition;
    }

    onUpdate(callback) { this._onUpdate = callback; }
    onEnd(callback) { this._onEnd = callback; }
    onError(callback) { this._onError = callback; }

    start() {
        if (!this._recognition) { return false; }
        this._transcript = '';
        this._interim = '';
        try {
            this._recognition.start();
            this._isListening = true;
            return true;
        } catch (e) {
            return false;
        }
    }

    stop() {
        if (!this._recognition) { return; }
        this._isListening = false;
        try { this._recognition.stop(); } catch (e) { /* silent */ }
    }

    get isListening() { return this._isListening; }
    get transcript() { return this._transcript; }
    get interim() { return this._interim; }

    destroy() {
        this.stop();
        if (this._recognition) {
            try { this._recognition.abort(); } catch (e) { /* silent */ }
            this._recognition = null;
        }
    }
}
