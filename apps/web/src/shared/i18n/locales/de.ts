import type ru from './ru'

// Русский — источник типов: ключа нет в de.ts — typecheck не пройдёт. Обращение к учителю — «Sie»
type Messages = typeof ru

const messages: Messages = {
  language: {
    label: 'Sprache:',
    switcherLabel: 'Sprache wählen',
    comingSoon: 'Demnächst',
  },
  nav: {
    home: 'Startseite',
    login: 'Anmelden',
    register: 'Registrieren',
    library: 'Aufgabenbibliothek',
    pricing: 'Preise',
    faq: 'FAQ',
    help: 'Hilfe-Center',
    createActivity: 'Aufgabe erstellen',
    myActivities: 'Meine Aufgaben',
    subscription: 'Abo verwalten',
  },
  header: {
    menu: 'Menü',
    openMenu: 'Menü öffnen',
    closeMenu: 'Menü schließen',
    logout: 'Abmelden',
  },
  auth: {
    card: {
      login: {
        title: 'Anmelden',
        subtitle: 'Melden Sie sich in Ihrem Lehrkräftekonto an',
        submit: 'Anmelden',
        submitBusy: 'Anmeldung läuft…',
        switchText: 'Noch kein Konto?',
        switchLabel: 'Registrieren',
      },
      register: {
        title: 'Registrierung',
        subtitle: 'Erstellen Sie ein Konto für Lehrkräfte',
        submit: 'Registrieren',
        submitBusy: 'Registrierung läuft…',
        switchText: 'Sie haben bereits ein Konto?',
        switchLabel: 'Anmelden',
      },
      verifyEmail: {
        title: 'E-Mail bestätigen',
        subtitle: 'Geben Sie das Passwort ein, das Sie bei der Registrierung festgelegt haben',
        submit: 'Bestätigen',
        submitBusy: 'Wird bestätigt…',
      },
      linkGoogle: {
        title: 'Mit Google anmelden',
        subtitle: 'Sie haben bereits ein Konto mit dieser E-Mail-Adresse. Geben Sie dessen Passwort ein, um sich künftig auch mit Google anzumelden',
        submit: 'Verknüpfen und anmelden',
        submitBusy: 'Wird verknüpft…',
      },
      forgotPassword: {
        title: 'Passwort zurücksetzen',
        subtitle: 'Geben Sie die E-Mail-Adresse Ihres Kontos ein – wir senden Ihnen einen Link für ein neues Passwort',
        submit: 'Link senden',
        submitBusy: 'Wird gesendet…',
        switchText: 'Passwort wieder eingefallen?',
        switchLabel: 'Anmelden',
      },
      resetPassword: {
        title: 'Neues Passwort',
        subtitle: 'Legen Sie ein neues Passwort fest. Zu einfache Passwörter werden nicht akzeptiert',
        submit: 'Passwort speichern',
        submitBusy: 'Wird gespeichert…',
      },
      googleCallback: {
        title: 'Anmeldung mit Google',
        subtitle: 'Einen Moment…',
      },
      sent: {
        title: 'Prüfen Sie Ihr Postfach',
        subtitle: 'Wir haben Ihnen eine E-Mail mit einem Link geschickt. Öffnen Sie sie und bestätigen Sie Ihre E-Mail-Adresse.',
      },
      sentForgotPassword: {
        title: 'Prüfen Sie Ihr Postfach',
        subtitle: 'Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir Ihnen eine E-Mail mit einem Link für ein neues Passwort geschickt.',
      },
      sentResetPassword: {
        title: 'Passwort geändert',
        subtitle: 'Melden Sie sich mit Ihrem neuen Passwort an. Auf Ihren anderen Geräten müssen Sie sich erneut anmelden.',
      },
      backToLogin: 'Zurück zur Anmeldung',
      forgotPasswordLink: 'Passwort vergessen?',
      or: 'oder',
      googleButton: 'Mit Google anmelden',
    },
    field: {
      name: 'Name',
      email: 'E-Mail',
      password: 'Passwort',
      newPassword: 'Neues Passwort',
      optional: 'optional',
      showPassword: 'Passwort anzeigen',
    },
    page: {
      missingToken: 'Der Link ist unvollständig. Öffnen Sie die E-Mail und klicken Sie erneut auf den Link',
      missingGoogleToken: 'Der Link ist unvollständig. Starten Sie die Anmeldung mit Google erneut',
      redirecting: 'Anmeldung fehlgeschlagen. Sie werden zur Anmeldeseite weitergeleitet…',
    },
    errors: {
      rejected: {
        login: 'E-Mail-Adresse oder Passwort ist falsch',
        register: 'Registrierung fehlgeschlagen. Prüfen Sie Ihre Angaben und versuchen Sie es erneut',
        verifyEmail: 'Der Link ist ungültig oder abgelaufen, oder das Passwort ist falsch',
        googleLink: 'Falsches Passwort oder der Link ist abgelaufen. Melden Sie sich erneut mit Google an',
        forgotPassword: 'Der Link konnte nicht gesendet werden. Prüfen Sie die E-Mail-Adresse und versuchen Sie es erneut',
        resetPassword: 'Der Link ist ungültig oder abgelaufen. Fordern Sie einen neuen an',
      },
      conflict: {
        verifyEmail: 'Ein Konto mit dieser E-Mail-Adresse existiert bereits – melden Sie sich an',
        googleLink: 'Dieses Google-Konto kann nicht mit Ihrem Konto verknüpft werden',
      },
      network: 'Keine Verbindung zum Server. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut',
      busy: 'Der Server ist gerade ausgelastet. Versuchen Sie es in einer Minute erneut',
      unknown: 'Etwas ist schiefgelaufen. Versuchen Sie es erneut',
      retryLater: 'Zu viele Versuche. Versuchen Sie es später erneut',
      retry: 'Zu viele Versuche. Versuchen Sie es in {minutes} Min. erneut',
      issue: {
        emailLatin: "Vor dem {'@'} sind nur lateinische Buchstaben, Ziffern und Zeichen erlaubt",
        emailTooLong: 'Die E-Mail-Adresse ist zu lang',
        emailLocalTooLong: "Der Teil vor dem {'@'} ist zu lang",
        emailInvalid: "Prüfen Sie die E-Mail-Adresse, zum Beispiel name{'@'}schule.de",
        passwordRequired: 'Geben Sie ein Passwort ein',
        passwordMin: 'Das Passwort muss mindestens {min} Zeichen lang sein',
        passwordMax: 'Das Passwort darf höchstens {max} Zeichen lang sein',
        passwordCommon: 'Dieses Passwort ist zu leicht zu erraten – wählen Sie ein anderes',
        passwordChars: 'Das Passwort enthält unzulässige Zeichen',
        nameMax: 'Der Name darf höchstens {max} Zeichen lang sein',
        nameChars: 'Der Name enthält unzulässige Zeichen',
      },
      field: {
        displayName: 'Prüfen Sie den Namen',
        email: 'Prüfen Sie die E-Mail-Adresse',
        password: 'Prüfen Sie das Passwort',
      },
      empty: {
        email: 'Geben Sie Ihre E-Mail-Adresse ein',
        password: 'Geben Sie ein Passwort ein',
      },
      google: {
        cancelled: 'Die Anmeldung mit Google wurde abgebrochen',
        state: 'Anmeldung mit Google fehlgeschlagen. Beginnen Sie von vorn',
        unavailable: 'Google ist gerade nicht erreichbar. Versuchen Sie es später erneut oder melden Sie sich mit Passwort an',
        failed: 'Anmeldung mit Google fehlgeschlagen. Versuchen Sie es erneut',
        emailUnverified: 'Die E-Mail-Adresse Ihres Google-Kontos ist nicht bestätigt',
        accountConflict: 'Mit dieser E-Mail-Adresse ist bereits ein anderes Google-Konto verknüpft',
      },
    },
  },
  errorPage: {
    notFound: {
      title: 'Diese Seite gibt es nicht',
      description: 'Vielleicht ist der Link veraltet oder enthält einen Tippfehler.',
    },
    serverError: {
      title: 'Etwas ist schiefgelaufen',
      description: 'Nat repariert es schon. Versuchen Sie es bitte etwas später erneut.',
    },
    home: 'Zur Startseite',
  },
  home: {
    meta: {
      title: 'Lernspiele und Aufgaben mit Noten für Lehrkräfte',
      description: 'Erstellen Sie in wenigen Minuten interaktive Aufgaben und Spiele, schicken Sie Ihrer Klasse einen Link und entscheiden Sie selbst, ob Sie eine Note vergeben.',
    },
    hero: {
      titleLine1: 'Leicht unterrichten,',
      titleLine2: 'lernen mit',
      titleMark: 'Spaß',
      pointCreate: 'Erstellen Sie in wenigen Minuten eine interaktive Aufgabe und schicken Sie den Link an Ihre Klasse.',
      pointGrading: 'Entscheiden Sie selbst, ob Sie eine Note vergeben und nach welchen Kriterien Sie bewerten.',
      pointNat: 'Fragen Sie Nat, Ihren virtuellen Assistenten: Er zeigt Ihnen, wo Sie anfangen, und hilft Ihnen, eine interaktive Aufgabe schneller zu erstellen.',
      cta: 'Aufgabe kostenlos erstellen',
    },
    howItWorks: {
      title: 'So funktioniert es',
      teachersTitle: 'Lehrkräfte und Nachhilfelehrer',
      teachersText: 'Lehrkräfte erstellen Aufgabensammlungen und entscheiden selbst, ob es eine Note gibt. Wenn ja, wählen sie fertige Bewertungskriterien oder legen eigene an. Ist die Aufgabe fertig, muss nur noch der Link an die Lernenden gehen.',
      studentsTitle: 'Schüler und Studierende',
      studentsText: 'Lernende beantworten die Fragen auf dem eigenen Handy, Tablet oder Computer oder auf Geräten im Klassenzimmer. Eine Registrierung ist nicht nötig: Es genügt, den Link zu öffnen. Am Ende der Aufgabe sehen sie sofort ihr Ergebnis und ihre Note.',
    },
    whyUs: {
      title: 'Warum Nataskium',
      reasons: {
        friendly: { title: 'Eine freundliche Oberfläche und farbenfrohe Vorlagen,', text: 'die die Aufmerksamkeit der Lernenden halten.' },
        quick: { title: 'Aufgaben sind schnell und einfach erstellt:', text: 'Sie kommen ohne Anleitung zurecht – oder mit Tipps von Nat, Ihrem virtuellen Assistenten.' },
        grading: { title: 'Bewertung nach Ihren Regeln:', text: 'fertige Bewertungskriterien oder ganz eigene.' },
        audio: { title: 'Aufgaben zum Anhören:', text: 'Fragen und Antwortmöglichkeiten werden vorgelesen. Praktisch für Kinder, die noch nicht gut lesen, und für den Fremdsprachenunterricht.' },
        library: { title: 'Eine Bibliothek fertiger Aufgaben:', text: 'einfach eine auswählen und sofort an die Klasse schicken.' },
      },
    },
    howToStart: {
      title: 'So fangen Sie an',
      stepFormat: 'Wählen Sie ein Aufgabenformat (Quiz, Test, Zuordnung, Spiel usw.) und eine Designvorlage.',
      stepQuestions: 'Fügen Sie eigene Fragen hinzu oder lassen Sie sich von Nat beim Formulieren helfen.',
      stepShare: 'Schicken Sie den Link an Ihre Klasse – und viel Spaß beim Lernen!',
    },
  },
  preFooter: {
    eyebrow: 'Jetzt loslegen',
    titleStart: 'Bereit, Ihren Unterricht modern und',
    titleAccent: 'spannend zu gestalten?',
    description: 'Werden Sie Teil von Nataskium und machen Sie Wissensabfragen zum Spiel.',
    cta: 'Kostenlos mitmachen',
  },
  footer: {
    navigation: 'Navigation',
    about: 'Über das Projekt',
    author: 'Erstellt von Natallia Pazniak',
    privacy: 'Datenschutzerklärung',
    refund: 'Rückerstattungsbedingungen',
    contact: 'Kontakt: {email}',
  },
}

export default messages
