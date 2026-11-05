// Популярные пароли, сравнение без учёта регистра: все значения в нижнем регистре.
// Источники: список NatsDoll (NordPass/SecLists 2024) и самые частые пароли от 4 символов из
// SecLists, Passwords/Common-Credentials/xato-net-10-million-passwords-1000.txt (лицензия MIT,
// https://github.com/danielmiessler/SecLists; исходные данные — Mark Burnett, 10 million passwords).
//
// Лицензия SecLists:
//
// MIT License
//
// Copyright (c) 2018 Daniel Miessler
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '123456', '123456789', '12345678', '12345', '1234567', '1234567890', '123123', '123321', '111111',
  '000000', '666666', '696969', '7777777', '11111111', '22222222', '33333333', '44444444',
  '55555555', '88888888', '99999999', '112233', '121212', '147258369', '159357', '159753',
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssword',
  'p@ssw0rd', 'pa$$word', 'qwerty', 'qwerty1', 'qwerty12', 'qwerty123', 'qwerty1234', 'qwertyuiop',
  'qazwsx', '1q2w3e', '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', 'q1w2e3r4', 'q1w2e3r4t5', 'asdfgh',
  'asdfghjkl', 'asdf1234', 'zxcvbn', 'zxcvbnm', 'abc123', 'abc12345', 'abcd1234', 'abcdef', 'admin',
  'admin123', 'administrator', 'welcome', 'welcome1', 'welcome123', 'login', 'master', 'letmein',
  'iloveyou', 'sunshine', 'princess', 'monkey', 'dragon', 'shadow', 'mustang', 'hunter', 'hottie',
  'freedom', 'trustno1', 'football', 'baseball', 'basketball', 'hockey', 'soccer', 'batman',
  'superman', 'starwars', 'pokemon', 'yugioh', 'michael', 'jessica', 'michelle', 'matthew',
  'daniel', 'charlie', 'mickey', 'ashley', 'jordan', 'jordan23', 'computer', 'internet', 'samsung',
  'iphone', 'android', 'google', 'test', 'test123', 'test1234', 'nataskium', 'nataskium123', '1234',
  '654321', 'pussy', 'fuckyou', '123qwe', 'killer', 'jennifer', 'buster', 'harley', 'andrew',
  'tigger', 'fuckme', '2000', 'robert', 'thomas', 'ranger', 'klaster', 'george', 'asshole',
  'pepper', '1111', '555555', '131313', '777777', 'pass', 'fuck', 'maggie', 'aaaaaa', 'ginger',
  'joshua', 'cheese', 'amanda', 'summer', 'love', '6969', 'nicole', 'chelsea', 'biteme', 'access',
  'yankees', '987654321', 'dallas', 'austin', 'thunder', 'taylor', 'matrix', 'william', 'corvette',
  'hello', 'martin', 'heather', 'secret', 'fucker', 'merlin', 'diamond', '1234qwer', 'gfhjkm',
  'hammer', 'silver', '222222', 'anthony', 'justin', 'bailey', 'patrick', 'scooter', 'orange',
  '11111', 'golfer', 'cookie', 'richard', 'samantha', 'bigdog', 'guitar', 'jackson', 'whatever',
  'chicken', 'sparky', 'snoopy', 'maverick', 'phoenix', 'camaro', 'sexy', 'peanut', 'morgan',
  'falcon', 'cowboy', 'ferrari', 'andrea', 'smokey', 'steelers', 'joseph', 'mercedes', 'dakota',
  // Частые PIN-коды и клавиатурные шаблоны
  '1212', '1122', '1313', '2580', '1q2w', '1qaz', 'qwer', 'asdf', 'zxcv', 'qwertz', 'azerty', 'йцукен',
  // «Пароль» на разных языках
  'пароль', 'пароль1', 'пароль123', 'passwort', 'motdepasse', 'contraseña', 'senha', 'wachtwoord', 'hasło',
])

// Ноль в обоих концах: 7890 и 0987 — тоже последовательности
const SEQUENCE_ALPHABETS = ['01234567890', 'abcdefghijklmnopqrstuvwxyz']
const REVERSED_SEQUENCE_ALPHABETS = SEQUENCE_ALPHABETS.map((alphabet) => [...alphabet].reverse().join(''))
const ALL_SEQUENCE_ALPHABETS = [...SEQUENCE_ALPHABETS, ...REVERSED_SEQUENCE_ALPHABETS]
const SINGLE_REPEATED_CHAR = /^(.)\1*$/su

function isRepeatedChar(password: string): boolean {
  return SINGLE_REPEATED_CHAR.test(password)
}

function isSimpleSequence(password: string): boolean {
  return password !== '' && ALL_SEQUENCE_ALPHABETS.some((alphabet) => alphabet.includes(password))
}

// Сравнение без учёта регистра
export function isCommonPassword(password: string): boolean {
  const lowerCase = password.toLowerCase()

  return COMMON_PASSWORDS.has(lowerCase) || isRepeatedChar(lowerCase) || isSimpleSequence(lowerCase)
}
