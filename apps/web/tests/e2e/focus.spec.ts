import { expect, test, type Locator, type Page } from '@playwright/test'

const DEFAULT_OUTLINE = 'rgb(26, 33, 64)'
const FOOTER_OUTLINE = 'rgb(255, 255, 255)'
const ROBOT_OUTLINE = 'rgb(255, 255, 255)'
const OUTLINE_WIDTH = '3px'
const ROBOT_OUTLINE_WIDTH = '2px'
const ROBOT_BACKDROP = 'rgba(20, 26, 54, 0.5) 0px 0px 0px 13px'
const MAX_TABS = 80

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

// Через настоящий цвет, а не строку: сборка сокращает #ffffff до #fff
function focusColor(locator: Locator) {
  return locator.evaluate((element) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--focus-color)'
    element.append(probe)
    const { color } = getComputedStyle(probe)
    probe.remove()
    return color
  })
}

async function tabTo(page: Page, target: Locator) {
  for (let tab = 0; tab < MAX_TABS; tab += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate(element => element === document.activeElement)) return
  }
  throw new Error('Tab не дошёл до элемента')
}

async function expectFocusRing(target: Locator, color: string, width = OUTLINE_WIDTH) {
  await expect(target).toBeFocused()
  await expect(target).toHaveCSS('outline-style', 'solid')
  await expect(target).toHaveCSS('outline-width', width)
  await expect(target).toHaveCSS('outline-color', color)
}

test.describe('Фокус с клавиатуры', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
  })

  test('--focus-color белый в футере и обычный в остальных блоках', async ({ page }) => {
    expect(await focusColor(page.locator('.app-footer'))).toBe(FOOTER_OUTLINE)
    expect(await focusColor(page.locator('.footer-nav__link').first())).toBe(FOOTER_OUTLINE)

    for (const selector of ['body', '.app-header', '.home-hero', '.pre-footer']) {
      expect(await focusColor(page.locator(selector).first())).toBe(DEFAULT_OUTLINE)
    }
  })

  test('виден на кнопке', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Создать задание бесплатно' })

    await tabTo(page, button)

    await expectFocusRing(button, DEFAULT_OUTLINE)
  })

  test('виден на кнопке в PreFooter', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Присоединиться бесплатно' })

    await tabTo(page, button)

    await expectFocusRing(button, DEFAULT_OUTLINE)
  })

  test('на роботе в PreFooter виден белым на тёмной подложке', async ({ page }) => {
    const robot = page.locator('.pre-footer__robot')

    await tabTo(page, robot)

    await expectFocusRing(robot, ROBOT_OUTLINE, ROBOT_OUTLINE_WIDTH)
    await expect(robot).toHaveCSS('box-shadow', ROBOT_BACKDROP)
  })

  test('на роботе в PreFooter не появляется от клика мышью', async ({ page }) => {
    const robot = page.locator('.pre-footer__robot')

    await robot.click()

    await expect(robot).toHaveCSS('outline-style', 'none')
    await expect(robot).toHaveCSS('box-shadow', 'none')
  })

  test('виден на ссылке в шапке', async ({ page }) => {
    const logo = page.locator('.app-header__logo')

    await tabTo(page, logo)

    await expectFocusRing(logo, DEFAULT_OUTLINE)
  })

  test('в футере виден белым на ссылке', async ({ page }) => {
    const link = page.locator('.footer-nav__link').first()

    await tabTo(page, link)

    await expectFocusRing(link, FOOTER_OUTLINE)
  })

  test('виден на «Войти» в открытом меню', async ({ page }) => {
    await page.locator('.app-header__burger').focus()
    await page.keyboard.press('Enter')
    const login = page.locator('.app-header__login')
    await expect(login).toBeVisible()

    await tabTo(page, login)

    await expectFocusRing(login, DEFAULT_OUTLINE)
  })

  test('не появляется от клика мышью', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Создать задание бесплатно' })

    await button.click()

    await expect(button).toHaveCSS('outline-style', 'none')
  })
})
