// null — «не отвечено»: считается неверным
export function gradeTrueFalse(items: readonly { answer: boolean }[], answers: readonly (boolean | null)[]): boolean[] {
  return items.map((item, index) => answers[index] === item.answer)
}
