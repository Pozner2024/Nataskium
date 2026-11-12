import type ru from './ru'

// Русский — источник типов: ключа нет в fr.ts — typecheck не пройдёт. Обращение к учителю — «vous».
// Перед « : ? ! » во французской типографике — неразрывный пробел \u00a0: знак не уедет на новую строку
type Messages = typeof ru

const messages: Messages = {
  language: {
    label: 'Langue\u00a0:',
    switcherLabel: 'Choisir la langue',
    comingSoon: 'Bientôt',
  },
  nav: {
    home: 'Accueil',
    login: 'Se connecter',
    register: "S'inscrire",
    library: "Bibliothèque d'activités",
    pricing: 'Tarifs',
    faq: 'FAQ',
    help: "Centre d'aide",
    createActivity: 'Créer une activité',
    myActivities: 'Mes activités',
    subscription: "Gérer l'abonnement",
  },
  header: {
    menu: 'Menu',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
    logout: 'Se déconnecter',
  },
  auth: {
    card: {
      login: {
        title: 'Connexion',
        subtitle: 'Connectez-vous à votre espace enseignant',
        submit: 'Se connecter',
        submitBusy: 'Connexion…',
        switchText: 'Pas encore de compte\u00a0?',
        switchLabel: "S'inscrire",
      },
      register: {
        title: 'Inscription',
        subtitle: 'Créez votre compte enseignant',
        submit: "S'inscrire",
        submitBusy: 'Inscription…',
        switchText: 'Vous avez déjà un compte\u00a0?',
        switchLabel: 'Se connecter',
      },
      verifyEmail: {
        title: "Confirmation de l'adresse e-mail",
        subtitle: "Saisissez le mot de passe choisi lors de l'inscription",
        submit: 'Confirmer',
        submitBusy: 'Confirmation…',
      },
      linkGoogle: {
        title: 'Connexion avec Google',
        subtitle: 'Vous avez déjà un compte avec cette adresse e-mail. Saisissez son mot de passe pour pouvoir aussi vous connecter avec Google',
        submit: 'Associer et se connecter',
        submitBusy: 'Association…',
      },
      forgotPassword: {
        title: 'Mot de passe oublié',
        subtitle: "Saisissez l'adresse e-mail de votre compte\u00a0: nous vous enverrons un lien pour choisir un nouveau mot de passe",
        submit: 'Envoyer le lien',
        submitBusy: 'Envoi…',
        switchText: 'Mot de passe retrouvé\u00a0?',
        switchLabel: 'Se connecter',
      },
      resetPassword: {
        title: 'Nouveau mot de passe',
        subtitle: 'Choisissez un nouveau mot de passe. Les mots de passe trop simples ne sont pas acceptés',
        submit: 'Enregistrer',
        submitBusy: 'Enregistrement…',
      },
      googleCallback: {
        title: 'Connexion avec Google',
        subtitle: 'Un instant…',
      },
      sent: {
        title: 'Consultez votre boîte mail',
        subtitle: 'Nous vous avons envoyé un e-mail avec un lien. Ouvrez-le pour confirmer votre adresse.',
      },
      sentForgotPassword: {
        title: 'Consultez votre boîte mail',
        subtitle: 'Si un compte existe avec cette adresse, nous vous avons envoyé un e-mail avec un lien pour choisir un nouveau mot de passe.',
      },
      sentResetPassword: {
        title: 'Mot de passe modifié',
        subtitle: 'Connectez-vous avec votre nouveau mot de passe. Sur vos autres appareils, vous devrez vous reconnecter.',
      },
      backToLogin: 'Retour à la connexion',
      forgotPasswordLink: 'Mot de passe oublié\u00a0?',
      or: 'ou',
      googleButton: 'Se connecter avec Google',
    },
    field: {
      name: 'Nom',
      email: 'E-mail',
      password: 'Mot de passe',
      newPassword: 'Nouveau mot de passe',
      optional: 'facultatif',
      showPassword: 'Afficher le mot de passe',
    },
    page: {
      missingToken: "Le lien est incomplet. Ouvrez l'e-mail et cliquez à nouveau sur le lien",
      missingGoogleToken: 'Le lien est incomplet. Recommencez la connexion avec Google',
      redirecting: 'La connexion a échoué. Retour à la page de connexion…',
    },
    errors: {
      rejected: {
        login: 'Adresse e-mail ou mot de passe incorrect',
        register: "L'inscription a échoué. Vérifiez vos informations et réessayez",
        verifyEmail: 'Le lien est invalide ou expiré, ou le mot de passe est incorrect',
        googleLink: 'Mot de passe incorrect ou lien expiré. Reconnectez-vous avec Google',
        forgotPassword: "Impossible d'envoyer le lien. Vérifiez l'adresse e-mail et réessayez",
        resetPassword: 'Le lien est invalide ou expiré. Demandez-en un nouveau',
      },
      conflict: {
        verifyEmail: 'Un compte existe déjà avec cette adresse\u00a0: connectez-vous',
        googleLink: 'Ce compte Google ne peut pas être associé à votre compte',
      },
      network: 'Pas de connexion au serveur. Vérifiez votre connexion Internet et réessayez',
      busy: 'Le serveur est occupé. Réessayez dans une minute',
      unknown: "Une erreur s'est produite. Réessayez",
      retryLater: 'Trop de tentatives. Réessayez plus tard',
      retry: 'Trop de tentatives. Réessayez dans {minutes}\u00a0min.',
      issue: {
        emailLatin: "Avant le {'@'}, utilisez uniquement des lettres latines, des chiffres et des symboles",
        emailTooLong: "L'adresse e-mail est trop longue",
        emailLocalTooLong: "La partie avant le {'@'} est trop longue",
        emailInvalid: "Vérifiez l'adresse e-mail, par exemple nom{'@'}ecole.fr",
        passwordRequired: 'Saisissez un mot de passe',
        passwordMin: 'Le mot de passe doit contenir au moins {min}\u00a0caractères',
        passwordMax: 'Le mot de passe doit contenir au maximum {max}\u00a0caractères',
        passwordCommon: 'Ce mot de passe est trop facile à deviner\u00a0: choisissez-en un autre',
        passwordChars: 'Le mot de passe contient des caractères non autorisés',
        nameMax: 'Le nom doit contenir au maximum {max}\u00a0caractères',
        nameChars: 'Le nom contient des caractères non autorisés',
      },
      field: {
        displayName: 'Vérifiez le nom',
        email: "Vérifiez l'adresse e-mail",
        password: 'Vérifiez le mot de passe',
      },
      empty: {
        email: 'Saisissez votre adresse e-mail',
        password: 'Saisissez un mot de passe',
      },
      google: {
        cancelled: 'La connexion avec Google a été annulée',
        state: 'Impossible de se connecter avec Google. Recommencez',
        unavailable: "Google n'est pas disponible pour le moment. Réessayez plus tard ou connectez-vous avec votre mot de passe",
        failed: 'Impossible de se connecter avec Google. Réessayez',
        emailUnverified: "L'adresse e-mail de votre compte Google n'est pas vérifiée",
        accountConflict: 'Un autre compte Google est déjà associé à cette adresse e-mail',
      },
    },
  },
  errorPage: {
    notFound: {
      title: "Cette page n'existe pas",
      description: 'Le lien est peut-être obsolète ou contient une faute de frappe.',
    },
    serverError: {
      title: "Une erreur s'est produite",
      description: 'Nat est déjà en train de réparer. Réessayez un peu plus tard.',
    },
    home: "Retour à l'accueil",
  },
  home: {
    meta: {
      title: 'Jeux éducatifs et activités notées pour les enseignants',
      description: 'Créez des activités et des jeux interactifs en quelques minutes, envoyez un lien à vos élèves et décidez vous-même de mettre une note ou non.',
    },
    hero: {
      titleLine1: 'Enseigner facilement,',
      titleLine2: 'apprendre en',
      titleMark: "s'amusant",
      pointCreate: 'Créez une activité interactive en quelques minutes et envoyez le lien à vos élèves.',
      pointGrading: 'Décidez vous-même de mettre une note ou non, et selon quels critères.',
      pointNat: 'Faites appel à Nat, votre assistant virtuel\u00a0: il vous indique par où commencer et vous aide à créer une activité interactive plus rapidement.',
      cta: 'Créer une activité gratuitement',
    },
    howItWorks: {
      title: 'Comment ça marche',
      teachersTitle: 'Enseignants et professeurs particuliers',
      teachersText: "Ils créent des séries d'activités et décident eux-mêmes de mettre une note ou non. S'il faut une note, ils choisissent des critères d'évaluation prêts à l'emploi ou créent les leurs. Une fois l'activité prête, il ne reste plus qu'à envoyer le lien aux élèves.",
      studentsTitle: 'Élèves et étudiants',
      studentsText: "Ils répondent aux questions sur leur téléphone, leur tablette ou leur ordinateur, ou sur les appareils de la classe. Pas besoin de s'inscrire\u00a0: il suffit d'ouvrir le lien. À la fin de l'activité, ils voient tout de suite leur résultat et leur note.",
    },
    whyUs: {
      title: 'Pourquoi choisir Nataskium',
      reasons: {
        friendly: { title: 'Une interface conviviale et des modèles colorés', text: "qui retiennent l'attention des élèves." },
        quick: { title: "Une activité se crée vite et facilement\u00a0:", text: "pas besoin de mode d'emploi, et Nat, votre assistant virtuel, est là pour vous guider." },
        grading: { title: 'Une évaluation selon vos règles\u00a0:', text: "des critères prêts à l'emploi ou les vôtres." },
        audio: { title: 'Des activités à écouter\u00a0:', text: 'les questions et les réponses sont lues à voix haute. Pratique pour les jeunes enfants qui lisent encore mal et pour les cours de langue étrangère.' },
        library: { title: "Une bibliothèque d'activités prêtes à l'emploi\u00a0:", text: 'choisissez-en une et envoyez-la tout de suite à vos élèves.' },
      },
    },
    howToStart: {
      title: 'Comment commencer',
      stepFormat: "Choisissez un format d'activité (quiz, test, association, jeu, etc.) et un modèle de présentation.",
      stepQuestions: 'Ajoutez vos propres questions ou demandez à Nat de vous aider à les rédiger.',
      stepShare: 'Envoyez le lien à vos élèves et laissez-les apprendre avec plaisir.',
    },
  },
  preFooter: {
    eyebrow: 'Commencez dès maintenant',
    titleStart: 'Envie de rendre vos cours modernes et',
    titleAccent: 'captivants\u00a0?',
    description: 'Rejoignez Nataskium et transformez les évaluations en jeu.',
    cta: 'Rejoindre gratuitement',
  },
  footer: {
    navigation: 'Navigation',
    about: 'À propos',
    author: 'Créé par Natallia Pazniak',
    privacy: 'Politique de confidentialité',
    refund: 'Conditions de remboursement',
    contact: 'Contact\u00a0: {email}',
  },
}

export default messages
