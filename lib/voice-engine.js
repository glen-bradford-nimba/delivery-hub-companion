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
                    ? this._transcript + ' ' + finalText
                    : finalText;
            }
            this._interim = interimText;
            if (this._onUpdate) {
                this._onUpdate(this._transcript, this._interim);
            }
        };

        recognition.onerror = () => {
            this._isListening = false;
        };

        recognition.onend = () => {
            if (this._isListening) {
                try { recognition.start(); } catch (e) {
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
