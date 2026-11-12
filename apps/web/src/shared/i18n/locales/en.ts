import type ru from './ru'

// Русский — источник типов: ключа нет в en.ts — typecheck не пройдёт
type Messages = typeof ru

const messages: Messages = {
  language: {
    label: 'Language:',
    switcherLabel: 'Choose language',
    comingSoon: 'Coming soon',
  },
  nav: {
    home: 'Home',
    login: 'Sign in',
    register: 'Sign up',
    library: 'Activity library',
    pricing: 'Pricing plans',
    faq: 'FAQ',
    help: 'Help center',
    createActivity: 'Create activity',
    myActivities: 'My activities',
    subscription: 'Manage subscription',
  },
  header: {
    menu: 'Menu',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    logout: 'Sign out',
  },
  auth: {
    card: {
      login: {
        title: 'Sign in',
        subtitle: 'Sign in to your teacher account',
        submit: 'Sign in',
        submitBusy: 'Signing in…',
        switchText: "Don't have an account?",
        switchLabel: 'Sign up',
      },
      register: {
        title: 'Sign up',
        subtitle: 'Create a teacher account',
        submit: 'Sign up',
        submitBusy: 'Signing you up…',
        switchText: 'Already have an account?',
        switchLabel: 'Sign in',
      },
      verifyEmail: {
        title: 'Confirm your email',
        subtitle: 'Enter the password you set when you signed up',
        submit: 'Confirm',
        submitBusy: 'Confirming…',
      },
      linkGoogle: {
        title: 'Sign in with Google',
        subtitle: 'You already have an account with this email. Enter its password to sign in with Google too',
        submit: 'Link and sign in',
        submitBusy: 'Linking…',
      },
      forgotPassword: {
        title: 'Password recovery',
        subtitle: 'Enter your account email — we will send a link to set a new password',
        submit: 'Send link',
        submitBusy: 'Sending…',
        switchText: 'Remembered your password?',
        switchLabel: 'Sign in',
      },
      resetPassword: {
        title: 'New password',
        subtitle: 'Choose a new password. Passwords that are too simple will not be accepted',
        submit: 'Save password',
        submitBusy: 'Saving…',
      },
      googleCallback: {
        title: 'Signing in with Google',
        subtitle: 'Just a second…',
      },
      sent: {
        title: 'Check your email',
        subtitle: 'We sent you an email with a link. Open it to confirm your email.',
      },
      sentForgotPassword: {
        title: 'Check your email',
        subtitle: 'If an account with this email exists, we sent an email with a link to set a new password.',
      },
      sentResetPassword: {
        title: 'Password changed',
        subtitle: 'Sign in with your new password. You will need to sign in again on your other devices.',
      },
      backToLogin: 'Back to sign in',
      forgotPasswordLink: 'Forgot your password?',
      or: 'or',
      googleButton: 'Sign in with Google',
    },
    field: {
      name: 'Name',
      email: 'Email',
      password: 'Password',
      newPassword: 'New password',
      optional: 'optional',
      showPassword: 'Show password',
    },
    page: {
      missingToken: 'The link is incomplete. Open the email and follow the link again',
      missingGoogleToken: 'The link is incomplete. Start signing in with Google again',
      redirecting: 'Sign-in failed. Taking you back to the sign-in page…',
    },
    errors: {
      rejected: {
        login: 'Wrong email or password',
        register: 'Could not sign you up. Check your details and try again',
        verifyEmail: 'The link is invalid or expired, or the password is wrong',
        googleLink: 'Wrong password or the link has expired. Try signing in with Google again',
        forgotPassword: 'Could not send the link. Check your email and try again',
        resetPassword: 'The link is invalid or expired. Request a new one',
      },
      conflict: {
        verifyEmail: 'An account with this email already exists — sign in',
        googleLink: 'This Google account cannot be linked to your account',
      },
      network: 'No connection to the server. Check your internet and try again',
      busy: 'The server is busy right now. Try again in a minute',
      unknown: 'Something went wrong. Try again',
      retryLater: 'Too many attempts. Try again later',
      retry: 'Too many attempts. Try again in {minutes} min.',
      issue: {
        emailLatin: "Before the {'@'}, use only Latin letters, digits and symbols",
        emailTooLong: 'The email address is too long',
        emailLocalTooLong: "The part before the {'@'} is too long",
        emailInvalid: "Check the email address, for example name{'@'}school.com",
        passwordRequired: 'Enter a password',
        passwordMin: 'The password must be at least {min} characters',
        passwordMax: 'The password must be at most {max} characters',
        passwordCommon: 'This password is too easy to guess — choose another one',
        passwordChars: 'The password contains invalid characters',
        nameMax: 'The name must be at most {max} characters',
        nameChars: 'The name contains invalid characters',
      },
      field: {
        displayName: 'Check the name',
        email: 'Check the email address',
        password: 'Check the password',
      },
      empty: {
        email: 'Enter your email',
        password: 'Enter a password',
      },
      google: {
        cancelled: 'Google sign-in was cancelled',
        state: 'Could not sign in with Google. Start again',
        unavailable: 'Google is unavailable right now. Try again later or sign in with a password',
        failed: 'Could not sign in with Google. Try again',
        emailUnverified: 'The email on your Google account is not verified',
        accountConflict: 'Another Google account is already linked to this email',
      },
    },
  },
  errorPage: {
    notFound: {
      title: 'This page does not exist',
      description: 'The link may be outdated or contain a typo.',
    },
    serverError: {
      title: 'Something went wrong',
      description: 'Nat is already fixing it. Please try again a bit later.',
    },
    home: 'Back to home',
  },
  home: {
    meta: {
      title: 'Educational games and activities with grades for teachers',
      description: 'Create interactive activities and games in a couple of minutes, send your students a link and decide for yourself whether to give a grade.',
    },
    hero: {
      titleLine1: 'Teach with ease,',
      titleLine2: 'learn',
      titleMark: 'with fun',
      pointCreate: 'Create an interactive activity in a couple of minutes and send the link to your students.',
      pointGrading: 'You decide whether to give a grade and which grading criteria to use.',
      pointNat: 'Ask Nat, your virtual assistant: he will suggest where to start and help you put together an interactive activity faster.',
      cta: 'Create an activity for free',
    },
    howItWorks: {
      title: 'How it works',
      teachersTitle: 'Teachers and tutors',
      teachersText: 'They create sets of activities and decide for themselves whether to give a grade. If a grade is needed, they pick ready-made grading criteria or create their own. Once the activity is ready, all that is left is to send students the link.',
      studentsTitle: 'Students and learners',
      studentsText: 'They answer questions on their own phones, tablets and computers, or on devices in the classroom. No sign-up needed: just open the link. At the end of the activity they instantly see their result and grade.',
    },
    whyUs: {
      title: 'Why people choose Nataskium',
      reasons: {
        friendly: { title: 'A friendly interface and bright templates', text: 'that keep students engaged.' },
        quick: { title: 'Creating an activity is quick and easy:', text: 'you can figure it out without instructions, or with hints from Nat, your virtual assistant.' },
        grading: { title: 'Grading on your terms:', text: 'ready-made grading criteria or your own.' },
        audio: { title: 'Activities can be listened to:', text: 'questions and answer options are read aloud. Handy for young children who cannot read well yet, and for foreign language lessons.' },
        library: { title: 'A library of ready-made activities:', text: 'take one and send it to your students right away.' },
      },
    },
    howToStart: {
      title: 'How to start',
      stepFormat: 'Choose an activity format (quiz, test, matching, game and more) and a design template.',
      stepQuestions: 'Add your own questions or ask Nat to help you write them.',
      stepShare: 'Send the link to your students and let them learn with pleasure.',
    },
  },
  preFooter: {
    eyebrow: 'Get started right now',
    titleStart: 'Ready to make your lessons modern and',
    titleAccent: 'engaging?',
    description: 'Join Nataskium and turn knowledge checks into a game.',
    cta: 'Join for free',
  },
  footer: {
    navigation: 'Navigation',
    about: 'About',
    author: 'Created by Natallia Pazniak',
    privacy: 'Privacy policy',
    refund: 'Refund policy',
    contact: 'Contact: {email}',
  },
}

export default messages
