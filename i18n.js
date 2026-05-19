const translations = {
  en: {
    welcome: "Welcome to M-USD",
    balance: "Balance",
    send: "Send",
    receive: "Receive"
  },
  es: {
    welcome: "Bienvenido a M-USD",
    balance: "Saldo",
    send: "Enviar",
    receive: "Recibir"
  },
  fr: {
    welcome: "Bienvenue sur M-USD",
    balance: "Solde",
    send: "Envoyer",
    receive: "Recevoir"
  }
};

class I18n {
  constructor(lang = 'en') {
    this.lang = lang;
  }
  
  t(key) {
    return translations[this.lang]?.[key] || translations.en[key] || key;
  }
  
  setLanguage(lang) {
    this.lang = lang;
    localStorage.setItem('preferred_language', lang);
    this.updateUI();
  }
}