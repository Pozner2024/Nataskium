// Тексты писем на каждом поддерживаемом языке. Новый язык в SUPPORTED_LOCALES без шаблонов не соберётся:
// Record<Locale, …> требует все языки. Ссылки и имя уже подготовлены вызывающим: link собран из серверных значений,
// имя экранировано для HTML
import type { Locale } from '@nataskium/shared/locales'

const APP_NAME = 'Nataskium'

export type Greeting = { html: string; text: string }

export type Mail = { subject: string; html: string; text: string }

export type EmailTemplates = {
  greeting(displayName: string | null | undefined, escape: (value: string) => string): Greeting
  verification(args: { hello: Greeting; link: string; hours: number }): Mail
  accountExists(args: { hello: Greeting; link: string }): Mail
  passwordReset(args: { hello: Greeting; link: string; hours: number }): Mail
  passwordChanged(args: { hello: Greeting; link: string }): Mail
  googleLinked(args: { hello: Greeting; link: string }): Mail
  accountDeleted(args: { hello: Greeting }): Mail
}

// Число со словом в нужной форме: правила языка (ru: 1 час, 2 часа, 5 часов; fr: 0 и 1 — единственное число) —
// из Intl.PluralRules. Формы, которых в языке нет, не нужны: тогда берётся other
type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

function countText(locale: Locale, count: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(locale).select(count)
  return `${count} ${forms[category] ?? forms.other}`
}

const HOURS_EN: PluralForms = { one: 'hour', other: 'hours' }
const HOURS_RU: PluralForms = { one: 'час', few: 'часа', many: 'часов', other: 'часа' }
const HOURS_DE: PluralForms = { one: 'Stunde', other: 'Stunden' }
const HOURS_FR: PluralForms = { one: 'heure', other: 'heures' }

const en: EmailTemplates = {
  greeting(displayName, escape) {
    if (displayName === null || displayName === undefined) return { html: 'Hi,', text: 'Hi,' }
    return { html: `Hi ${escape(displayName)},`, text: `Hi ${displayName},` }
  },

  verification({ hello, link, hours }) {
    const hoursText = countText('en', hours, HOURS_EN)
    // В HTML только серверные значения: origin из env и токен из CSPRNG в base64url
    return {
      subject: `Confirm your email — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Thanks for signing up for ${APP_NAME}!</p>
          <p>Please confirm your email address by clicking the link below and entering the password you chose:</p>
          <p><a href="${link}">Confirm email</a></p>
          <p>The link expires in ${hoursText}. If you didn't sign up, just ignore this email.</p>
        `,
      text: [
        hello.text,
        '',
        `Thanks for signing up for ${APP_NAME}!`,
        'Please confirm your email address by opening the link below and entering the password you chose:',
        link,
        '',
        `The link expires in ${hoursText}. If you didn't sign up, just ignore this email.`,
      ].join('\n'),
    }
  },

  accountExists({ hello, link }) {
    return {
      subject: `You already have an account — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Someone tried to sign up with this email, but an account already exists.</p>
          <p>Just <a href="${link}">sign in</a> as usual. If it wasn't you, just ignore this email.</p>
        `,
      text: [
        hello.text,
        '',
        'Someone tried to sign up with this email, but an account already exists.',
        `Just sign in as usual: ${link}`,
        "If it wasn't you, just ignore this email.",
      ].join('\n'),
    }
  },

  passwordReset({ hello, link, hours }) {
    const expiry = `The link expires in ${countText('en', hours, HOURS_EN)} and works once.`
    return {
      subject: `Reset your password — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>We received a request to reset your password.</p>
          <p>Click the link below to choose a new one:</p>
          <p><a href="${link}">Reset password</a></p>
          <p>${expiry} If you didn't request this, just ignore this email: your password stays the same.</p>
        `,
      text: [
        hello.text,
        '',
        'We received a request to reset your password.',
        'Open the link below to choose a new one:',
        link,
        '',
        `${expiry} If you didn't request this, just ignore this email: your password stays the same.`,
      ].join('\n'),
    }
  },

  passwordChanged({ hello, link }) {
    return {
      subject: `Your password was changed — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>The password for your ${APP_NAME} account was just changed, and you were signed out on all devices.</p>
          <p>If this was you, you can <a href="${link}">sign in</a> with your new password.</p>
          <p>If this wasn't you, reset your password immediately: open the <a href="${link}">sign-in page</a> and choose "Forgot password".</p>
        `,
      text: [
        hello.text,
        '',
        `The password for your ${APP_NAME} account was just changed, and you were signed out on all devices.`,
        `If this was you, you can sign in with your new password: ${link}`,
        `If this wasn't you, reset your password immediately: open ${link} and choose "Forgot password".`,
      ].join('\n'),
    }
  },

  googleLinked({ hello, link }) {
    return {
      subject: `Google sign-in was added to your account — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Sign-in with Google was just added to your ${APP_NAME} account. You can now sign in with Google or with your password.</p>
          <p>If this wasn't you, reset your password immediately: open the <a href="${link}">sign-in page</a> and choose "Forgot password".</p>
        `,
      text: [
        hello.text,
        '',
        `Sign-in with Google was just added to your ${APP_NAME} account. You can now sign in with Google or with your password.`,
        `If this wasn't you, reset your password immediately: open ${link} and choose "Forgot password".`,
      ].join('\n'),
    }
  },

  accountDeleted({ hello }) {
    return {
      subject: `Your account was deleted — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Your ${APP_NAME} account and all its data were deleted at your request: activities, grading scales and sign-in sessions. Links to your activities no longer work.</p>
          <p>You can create a new account at any time.</p>
        `,
      text: [hello.text, '', `Your ${APP_NAME} account and all its data were deleted at your request: activities, grading scales and sign-in sessions. Links to your activities no longer work.`, `You can create a new account at any time.`].join('\n'),
    }
  },
}

const ru: EmailTemplates = {
  greeting(displayName, escape) {
    if (displayName === null || displayName === undefined) return { html: 'Здравствуйте!', text: 'Здравствуйте!' }
    return { html: `Здравствуйте, ${escape(displayName)}!`, text: `Здравствуйте, ${displayName}!` }
  },

  verification({ hello, link, hours }) {
    const hoursText = countText('ru', hours, HOURS_RU)
    return {
      subject: `Подтвердите почту — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Спасибо за регистрацию в ${APP_NAME}!</p>
          <p>Подтвердите адрес почты: перейдите по ссылке ниже и введите пароль, который вы задали:</p>
          <p><a href="${link}">Подтвердить почту</a></p>
          <p>Ссылка действует ${hoursText}. Если вы не регистрировались, просто проигнорируйте это письмо.</p>
        `,
      text: [
        hello.text,
        '',
        `Спасибо за регистрацию в ${APP_NAME}!`,
        'Подтвердите адрес почты: откройте ссылку ниже и введите пароль, который вы задали:',
        link,
        '',
        `Ссылка действует ${hoursText}. Если вы не регистрировались, просто проигнорируйте это письмо.`,
      ].join('\n'),
    }
  },

  accountExists({ hello, link }) {
    return {
      subject: `У вас уже есть аккаунт — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Кто-то пытался зарегистрироваться с этой почтой, но аккаунт уже существует.</p>
          <p>Просто <a href="${link}">войдите</a> как обычно. Если это были не вы, проигнорируйте это письмо.</p>
        `,
      text: [
        hello.text,
        '',
        'Кто-то пытался зарегистрироваться с этой почтой, но аккаунт уже существует.',
        `Просто войдите как обычно: ${link}`,
        'Если это были не вы, проигнорируйте это письмо.',
      ].join('\n'),
    }
  },

  passwordReset({ hello, link, hours }) {
    const expiry = `Ссылка действует ${countText('ru', hours, HOURS_RU)} и срабатывает один раз.`
    return {
      subject: `Сброс пароля — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Мы получили запрос на сброс вашего пароля.</p>
          <p>Перейдите по ссылке ниже, чтобы задать новый:</p>
          <p><a href="${link}">Сбросить пароль</a></p>
          <p>${expiry} Если вы ничего не запрашивали, просто проигнорируйте это письмо: пароль останется прежним.</p>
        `,
      text: [
        hello.text,
        '',
        'Мы получили запрос на сброс вашего пароля.',
        'Откройте ссылку ниже, чтобы задать новый:',
        link,
        '',
        `${expiry} Если вы ничего не запрашивали, просто проигнорируйте это письмо: пароль останется прежним.`,
      ].join('\n'),
    }
  },

  passwordChanged({ hello, link }) {
    return {
      subject: `Пароль изменён — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Пароль от вашего аккаунта ${APP_NAME} только что изменён, и вы вышли на всех устройствах.</p>
          <p>Если это были вы, <a href="${link}">войдите</a> с новым паролем.</p>
          <p>Если это были не вы, сразу сбросьте пароль: откройте <a href="${link}">страницу входа</a> и выберите «Забыли пароль?».</p>
        `,
      text: [
        hello.text,
        '',
        `Пароль от вашего аккаунта ${APP_NAME} только что изменён, и вы вышли на всех устройствах.`,
        `Если это были вы, войдите с новым паролем: ${link}`,
        `Если это были не вы, сразу сбросьте пароль: откройте ${link} и выберите «Забыли пароль?».`,
      ].join('\n'),
    }
  },

  googleLinked({ hello, link }) {
    return {
      subject: `К аккаунту добавлен вход через Google — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>К вашему аккаунту ${APP_NAME} только что добавлен вход через Google. Теперь можно входить через Google или по паролю.</p>
          <p>Если это были не вы, сразу сбросьте пароль: откройте <a href="${link}">страницу входа</a> и выберите «Забыли пароль?».</p>
        `,
      text: [
        hello.text,
        '',
        `К вашему аккаунту ${APP_NAME} только что добавлен вход через Google. Теперь можно входить через Google или по паролю.`,
        `Если это были не вы, сразу сбросьте пароль: откройте ${link} и выберите «Забыли пароль?».`,
      ].join('\n'),
    }
  },

  accountDeleted({ hello }) {
    return {
      subject: `Аккаунт удалён — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Ваш аккаунт ${APP_NAME} и все его данные удалены по вашему запросу: задания, шкалы оценивания и сеансы входа. Ссылки на ваши задания больше не работают.</p>
          <p>Вы можете в любой момент создать новый аккаунт.</p>
        `,
      text: [hello.text, '', `Ваш аккаунт ${APP_NAME} и все его данные удалены по вашему запросу: задания, шкалы оценивания и сеансы входа. Ссылки на ваши задания больше не работают.`, `Вы можете в любой момент создать новый аккаунт.`].join('\n'),
    }
  },
}

const de: EmailTemplates = {
  greeting(displayName, escape) {
    if (displayName === null || displayName === undefined) return { html: 'Hallo,', text: 'Hallo,' }
    return { html: `Hallo ${escape(displayName)},`, text: `Hallo ${displayName},` }
  },

  verification({ hello, link, hours }) {
    const hoursText = countText('de', hours, HOURS_DE)
    return {
      subject: `Bestätigen Sie Ihre E-Mail-Adresse — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>vielen Dank für Ihre Registrierung bei ${APP_NAME}!</p>
          <p>Bitte bestätigen Sie Ihre E-Mail-Adresse: Klicken Sie auf den Link unten und geben Sie das Passwort ein, das Sie gewählt haben:</p>
          <p><a href="${link}">E-Mail-Adresse bestätigen</a></p>
          <p>Der Link ist ${hoursText} gültig. Falls Sie sich nicht registriert haben, ignorieren Sie diese E-Mail einfach.</p>
        `,
      text: [
        hello.text,
        '',
        `vielen Dank für Ihre Registrierung bei ${APP_NAME}!`,
        'Bitte bestätigen Sie Ihre E-Mail-Adresse: Öffnen Sie den Link unten und geben Sie das Passwort ein, das Sie gewählt haben:',
        link,
        '',
        `Der Link ist ${hoursText} gültig. Falls Sie sich nicht registriert haben, ignorieren Sie diese E-Mail einfach.`,
      ].join('\n'),
    }
  },

  accountExists({ hello, link }) {
    return {
      subject: `Sie haben bereits ein Konto — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>jemand hat versucht, sich mit dieser E-Mail-Adresse zu registrieren, aber es gibt bereits ein Konto.</p>
          <p><a href="${link}">Melden Sie sich einfach wie gewohnt an</a>. Falls Sie das nicht waren, ignorieren Sie diese E-Mail.</p>
        `,
      text: [
        hello.text,
        '',
        'jemand hat versucht, sich mit dieser E-Mail-Adresse zu registrieren, aber es gibt bereits ein Konto.',
        `Melden Sie sich einfach wie gewohnt an: ${link}`,
        'Falls Sie das nicht waren, ignorieren Sie diese E-Mail.',
      ].join('\n'),
    }
  },

  passwordReset({ hello, link, hours }) {
    const expiry = `Der Link ist ${countText('de', hours, HOURS_DE)} gültig und funktioniert nur einmal.`
    return {
      subject: `Passwort zurücksetzen — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten.</p>
          <p>Klicken Sie auf den Link unten, um ein neues Passwort festzulegen:</p>
          <p><a href="${link}">Passwort zurücksetzen</a></p>
          <p>${expiry} Falls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail einfach: Ihr Passwort bleibt unverändert.</p>
        `,
      text: [
        hello.text,
        '',
        'wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten.',
        'Öffnen Sie den Link unten, um ein neues Passwort festzulegen:',
        link,
        '',
        `${expiry} Falls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail einfach: Ihr Passwort bleibt unverändert.`,
      ].join('\n'),
    }
  },

  passwordChanged({ hello, link }) {
    return {
      subject: `Ihr Passwort wurde geändert — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>das Passwort für Ihr ${APP_NAME}-Konto wurde soeben geändert, und Sie wurden auf allen Geräten abgemeldet.</p>
          <p>Wenn Sie das waren, können Sie sich mit Ihrem neuen Passwort <a href="${link}">anmelden</a>.</p>
          <p>Wenn Sie das nicht waren, setzen Sie Ihr Passwort sofort zurück: Öffnen Sie die <a href="${link}">Anmeldeseite</a> und wählen Sie „Passwort vergessen?“.</p>
        `,
      text: [
        hello.text,
        '',
        `das Passwort für Ihr ${APP_NAME}-Konto wurde soeben geändert, und Sie wurden auf allen Geräten abgemeldet.`,
        `Wenn Sie das waren, können Sie sich mit Ihrem neuen Passwort anmelden: ${link}`,
        `Wenn Sie das nicht waren, setzen Sie Ihr Passwort sofort zurück: Öffnen Sie ${link} und wählen Sie „Passwort vergessen?“.`,
      ].join('\n'),
    }
  },

  googleLinked({ hello, link }) {
    return {
      subject: `Anmeldung mit Google zu Ihrem Konto hinzugefügt — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>zu Ihrem ${APP_NAME}-Konto wurde soeben die Anmeldung mit Google hinzugefügt. Sie können sich jetzt mit Google oder mit Ihrem Passwort anmelden.</p>
          <p>Wenn Sie das nicht waren, setzen Sie Ihr Passwort sofort zurück: Öffnen Sie die <a href="${link}">Anmeldeseite</a> und wählen Sie „Passwort vergessen?“.</p>
        `,
      text: [
        hello.text,
        '',
        `zu Ihrem ${APP_NAME}-Konto wurde soeben die Anmeldung mit Google hinzugefügt. Sie können sich jetzt mit Google oder mit Ihrem Passwort anmelden.`,
        `Wenn Sie das nicht waren, setzen Sie Ihr Passwort sofort zurück: Öffnen Sie ${link} und wählen Sie „Passwort vergessen?“.`,
      ].join('\n'),
    }
  },

  accountDeleted({ hello }) {
    return {
      subject: `Ihr Konto wurde gelöscht — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Ihr ${APP_NAME}-Konto und alle zugehörigen Daten wurden auf Ihren Wunsch gelöscht: Aufgaben, Bewertungsskalen und Anmeldesitzungen. Links zu Ihren Aufgaben funktionieren nicht mehr.</p>
          <p>Sie können jederzeit ein neues Konto erstellen.</p>
        `,
      text: [hello.text, '', `Ihr ${APP_NAME}-Konto und alle zugehörigen Daten wurden auf Ihren Wunsch gelöscht: Aufgaben, Bewertungsskalen und Anmeldesitzungen. Links zu Ihren Aufgaben funktionieren nicht mehr.`, `Sie können jederzeit ein neues Konto erstellen.`].join('\n'),
    }
  },
}

// Перед « : ? ! » — неразрывный пробел \u00a0, как во французском интерфейсе
const fr: EmailTemplates = {
  greeting(displayName, escape) {
    if (displayName === null || displayName === undefined) return { html: 'Bonjour,', text: 'Bonjour,' }
    return { html: `Bonjour ${escape(displayName)},`, text: `Bonjour ${displayName},` }
  },

  verification({ hello, link, hours }) {
    const hoursText = countText('fr', hours, HOURS_FR)
    return {
      subject: `Confirmez votre adresse e-mail — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Merci pour votre inscription sur ${APP_NAME}\u00a0!</p>
          <p>Confirmez votre adresse e-mail\u00a0: cliquez sur le lien ci-dessous et saisissez le mot de passe que vous avez choisi\u00a0:</p>
          <p><a href="${link}">Confirmer mon adresse e-mail</a></p>
          <p>Le lien est valable ${hoursText}. Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet e-mail.</p>
        `,
      text: [
        hello.text,
        '',
        `Merci pour votre inscription sur ${APP_NAME}\u00a0!`,
        'Confirmez votre adresse e-mail\u00a0: ouvrez le lien ci-dessous et saisissez le mot de passe que vous avez choisi\u00a0:',
        link,
        '',
        `Le lien est valable ${hoursText}. Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet e-mail.`,
      ].join('\n'),
    }
  },

  accountExists({ hello, link }) {
    return {
      subject: `Vous avez déjà un compte — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Quelqu'un a essayé de s'inscrire avec cette adresse e-mail, mais un compte existe déjà.</p>
          <p>Il vous suffit de vous <a href="${link}">connecter</a> comme d'habitude. Si ce n'était pas vous, ignorez cet e-mail.</p>
        `,
      text: [
        hello.text,
        '',
        "Quelqu'un a essayé de s'inscrire avec cette adresse e-mail, mais un compte existe déjà.",
        `Il vous suffit de vous connecter comme d'habitude\u00a0: ${link}`,
        "Si ce n'était pas vous, ignorez cet e-mail.",
      ].join('\n'),
    }
  },

  passwordReset({ hello, link, hours }) {
    const expiry = `Le lien est valable ${countText('fr', hours, HOURS_FR)} et ne fonctionne qu'une seule fois.`
    return {
      subject: `Réinitialisation du mot de passe — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Nous avons reçu une demande de réinitialisation de votre mot de passe.</p>
          <p>Cliquez sur le lien ci-dessous pour en choisir un nouveau\u00a0:</p>
          <p><a href="${link}">Réinitialiser le mot de passe</a></p>
          <p>${expiry} Si vous n'avez rien demandé, ignorez simplement cet e-mail\u00a0: votre mot de passe reste inchangé.</p>
        `,
      text: [
        hello.text,
        '',
        'Nous avons reçu une demande de réinitialisation de votre mot de passe.',
        'Ouvrez le lien ci-dessous pour en choisir un nouveau\u00a0:',
        link,
        '',
        `${expiry} Si vous n'avez rien demandé, ignorez simplement cet e-mail\u00a0: votre mot de passe reste inchangé.`,
      ].join('\n'),
    }
  },

  passwordChanged({ hello, link }) {
    return {
      subject: `Votre mot de passe a été modifié — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Le mot de passe de votre compte ${APP_NAME} vient d'être modifié et vos sessions ont été fermées sur tous les appareils.</p>
          <p>Si c'était vous, vous pouvez vous <a href="${link}">connecter</a> avec votre nouveau mot de passe.</p>
          <p>Si ce n'était pas vous, réinitialisez immédiatement votre mot de passe\u00a0: ouvrez la <a href="${link}">page de connexion</a> et choisissez «\u00a0Mot de passe oublié\u00a0?\u00a0».</p>
        `,
      text: [
        hello.text,
        '',
        `Le mot de passe de votre compte ${APP_NAME} vient d'être modifié et vos sessions ont été fermées sur tous les appareils.`,
        `Si c'était vous, vous pouvez vous connecter avec votre nouveau mot de passe\u00a0: ${link}`,
        `Si ce n'était pas vous, réinitialisez immédiatement votre mot de passe\u00a0: ouvrez ${link} et choisissez «\u00a0Mot de passe oublié\u00a0?\u00a0».`,
      ].join('\n'),
    }
  },

  googleLinked({ hello, link }) {
    return {
      subject: `Connexion avec Google ajoutée à votre compte — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>La connexion avec Google vient d'être ajoutée à votre compte ${APP_NAME}. Vous pouvez désormais vous connecter avec Google ou avec votre mot de passe.</p>
          <p>Si ce n'était pas vous, réinitialisez immédiatement votre mot de passe\u00a0: ouvrez la <a href="${link}">page de connexion</a> et choisissez «\u00a0Mot de passe oublié\u00a0?\u00a0».</p>
        `,
      text: [
        hello.text,
        '',
        `La connexion avec Google vient d'être ajoutée à votre compte ${APP_NAME}. Vous pouvez désormais vous connecter avec Google ou avec votre mot de passe.`,
        `Si ce n'était pas vous, réinitialisez immédiatement votre mot de passe\u00a0: ouvrez ${link} et choisissez «\u00a0Mot de passe oublié\u00a0?\u00a0».`,
      ].join('\n'),
    }
  },

  accountDeleted({ hello }) {
    return {
      subject: `Votre compte a été supprimé — ${APP_NAME}`,
      html: `
          <p>${hello.html}</p>
          <p>Votre compte ${APP_NAME} et toutes ses données ont été supprimés à votre demande\u00a0: activités, barèmes de notation et sessions de connexion. Les liens vers vos activités ne fonctionnent plus.</p>
          <p>Vous pouvez créer un nouveau compte à tout moment.</p>
        `,
      text: [hello.text, '', `Votre compte ${APP_NAME} et toutes ses données ont été supprimés à votre demande\u00a0: activités, barèmes de notation et sessions de connexion. Les liens vers vos activités ne fonctionnent plus.`, `Vous pouvez créer un nouveau compte à tout moment.`].join('\n'),
    }
  },
}

export const EMAIL_TEMPLATES: Record<Locale, EmailTemplates> = { ru, en, de, fr }
