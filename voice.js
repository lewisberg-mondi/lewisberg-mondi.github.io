/**
 * Kanairoex Voice (Speech Recognition + Text-to-Speech)
 * Uses browser built-in Web Speech API — fully offline after browser support.
 */

const Voice = (() => {
  let recognition = null;
  let isListening = false;
  let onResultCallback = null;

  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function startListening(onResult, onError) {
    if (!isSupported()) {
      if (onError) onError("Speech recognition not supported in this browser.");
      return false;
    }
    if (isListening) stopListening();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      if (onResult) onResult(text);
      isListening = false;
    };
    recognition.onerror = (e) => {
      isListening = false;
      if (onError) onError(e.error || "Recognition error");
    };
    recognition.onend = () => { isListening = false; };

    try {
      recognition.start();
      isListening = true;
      return true;
    } catch (e) {
      if (onError) onError(String(e));
      return false;
    }
  }

  function stopListening() {
    if (recognition && isListening) {
      try { recognition.stop(); } catch {}
    }
    isListening = false;
  }

  function speak(text, options = {}) {
    if (!window.speechSynthesis) return false;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 500));
    utter.rate = options.rate || 1;
    utter.pitch = options.pitch || 1;
    utter.volume = options.volume || 1;
    if (options.voice) utter.voice = options.voice;
    window.speechSynthesis.speak(utter);
    return true;
  }

  function stopSpeaking() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function getVoices() {
    return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  return {
    isSupported,
    startListening,
    stopListening,
    isListening: () => isListening,
    speak,
    stopSpeaking,
    getVoices
  };
})();
