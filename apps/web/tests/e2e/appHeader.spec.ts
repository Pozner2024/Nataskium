import { expect, test, type Page } from '@playwright/test'

// Служебная страница есть только в режиме разработки, E2E идут на dev-сервере
const OTHER_ROUTE = '/nat'
const ACTIVE_ITEM_CLASS = /app-header__item--active/
const LOGIN_HEIGHT_PX = 60
const LINE_TOLERANCE_PX = 1
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

// До гидратации SSR-разметка на клики не реагирует. __vue_app__ не годится как сигнал:
// он появляется раньше, чем гидратируются асинхронные части, в том числе layout с шапкой
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

async function readLines(page: Page) {
  return page.evaluate(() => {
    const read = (color: string) => {
      const element = document.querySelector(`.app-header__line--${color}`)!
      const { left, width, height, y } = element.getBoundingClientRect()
      return { left, width, height, y, opacity: Number(getComputedStyle(element).opacity) }
    }
    return { blue: read('blue'), green: read('green'), orange: read('orange') }
  })
}

// Крестик: зелёной не видно, синяя и оранжевая стоят в одной точке и наклонены (рамка почти квадратная)
async function isCross(page: Page) {
  const { blue, green, orange } = await readLines(page)
  const isSamePlace = Math.abs(blue.y - orange.y) <= LINE_TOLERANCE_PX && Math.abs(blue.left - orange.left) <= LINE_TOLERANCE_PX
  const isTilted = Math.abs(blue.width - blue.height) <= LINE_TOLERANCE_PX
  return green.opacity === 0 && isSamePlace && isTilted
}

test.describe('AppHeader', () => {
  test('шторка видна только пока меню открыто', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    const item = page.locator('.app-header__item').first()
    const burger = page.locator('.app-header__burger')

    await expect(item).toBeHidden()

    await burger.click()
    await expect(item).toBeVisible()

    await burger.click()
    await expect(item).toBeHidden()
  })

  test('подсвечен только пункт текущей страницы', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.app-header__item').first()).toHaveClass(ACTIVE_ITEM_CLASS)

    await page.goto(OTHER_ROUTE)
    await expect(page.locator('.app-header__item').first()).not.toHaveClass(ACTIVE_ITEM_CLASS)
  })

  test('«Войти» в шторке — кнопка на всю ширину с высотой 60px', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    await page.locator('.app-header__burger').click()
    const login = page.locator('.app-header__login')

    await expect(login).toBeVisible()
    await expect(login.locator('.app-button__arrow')).toBeVisible()
    const box = await login.boundingBox()
    expect(box?.height).toBe(LOGIN_HEIGHT_PX)
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(box!.width).toBeGreaterThan(page.viewportSize()!.width / 2)
  })

  test.describe('наведение и нажатие', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } })

    test('подложка бургера появляется при наведении мышью', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'нужна мышь')
      await page.goto('/')
      await waitForHydration(page)

      await page.locator('.app-header__burger').hover()

      await expect(page.locator('.app-header__burger')).not.toHaveCSS('background-color', TRANSPARENT)
    })

    test('после тапа подложка бургера не залипает', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'phone', 'нужен тач')
      await page.goto('/')
      await waitForHydration(page)
      const burger = page.locator('.app-header__burger')

      await burger.tap()
      await expect(burger).toHaveAttribute('aria-expanded', 'true')
      await burger.tap()
      await expect(burger).toHaveAttribute('aria-expanded', 'false')

      await expect(burger).toHaveCSS('background-color', TRANSPARENT)
    })

    test('пункт меню отзывается на наведение и нажатие', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'нужна мышь')
      await page.goto(OTHER_ROUTE)
      await waitForHydration(page)
      await page.locator('.app-header__burger').click()
      const item = page.locator('.app-header__item').first()
      await expect(item).toBeVisible()
      const background = () => item.evaluate(element => getComputedStyle(element).backgroundColor)
      const idle = await background()

      await item.hover()
      await expect.poll(background).not.toBe(idle)
      const hovered = await background()

      await page.mouse.down()
      await expect.poll(background).not.toBe(hovered)
      await page.mouse.move(0, 0)
      await page.mouse.up()
    })
  })

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test.describe(`полоски бургера, reducedMotion: ${reducedMotion}`, () => {
      test.use({ contextOptions: { reducedMotion } })

      test('закрытый бургер — три полоски разной длины от одного левого края', async ({ page }) => {
        await page.goto('/')
        await waitForHydration(page)

        const { blue, green, orange } = await readLines(page)

        expect(blue.width).toBeGreaterThan(orange.width)
        expect(orange.width).toBeGreaterThan(green.width)
        expect(blue.y).toBeLessThan(green.y)
        expect(green.y).toBeLessThan(orange.y)
        expect(Math.abs(blue.left - green.left)).toBeLessThanOrEqual(LINE_TOLERANCE_PX)
        expect(Math.abs(blue.left - orange.left)).toBeLessThanOrEqual(LINE_TOLERANCE_PX)
        expect(green.opacity).toBe(1)
      })

      test('открытый бургер — крестик, закрытый возвращается как был', async ({ page }) => {
        await page.goto('/')
        await waitForHydration(page)
        const burger = page.locator('.app-header__burger')
        const closed = await readLines(page)
        const burgerBox = await burger.boundingBox()

        await burger.click()
        await expect.poll(() => isCross(page)).toBe(true)
        expect(await burger.boundingBox()).toEqual(burgerBox)

        await burger.click()
        await expect.poll(async () => {
          const { blue, green, orange } = await readLines(page)
          return [blue.width, green.width, orange.width, green.opacity].map(value => Math.round(value))
        }).toEqual([closed.blue.width, closed.green.width, closed.orange.width, 1].map(value => Math.round(value)))
      })
    })
  }

  test.describe('закрытие меню', () => {
    const burger = (page: Page) => page.locator('.app-header__burger')

    async function openMenu(page: Page, route = '/') {
      await page.goto(route)
      await waitForHydration(page)
      await burger(page).click()
      await expect(burger(page)).toHaveAttribute('aria-expanded', 'true')
      await expect.poll(() => pageOverflow(page)).toBe('hidden')
    }

    function pageOverflow(page: Page) {
      return page.evaluate(() => document.documentElement.style.overflow)
    }

    async function expectMenuClosed(page: Page) {
      await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
      await expect.poll(() => pageOverflow(page)).toBe('')
      await expect(burger(page)).toBeFocused()
    }

    test('клик по «Главная» на главной закрывает меню', async ({ page }) => {
      await openMenu(page)
      await page.locator('.app-header__item').first().click()
      await expectMenuClosed(page)
    })

    test('клик по логотипу на главной закрывает меню', async ({ page }) => {
      await openMenu(page)
      await page.locator('.app-header__logo').click()
      await expectMenuClosed(page)
    })

    test('клик по логотипу при закрытом меню не переводит фокус на бургер', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)
      await page.locator('.app-header__logo').click()

      await expect(page.locator('.app-header__logo')).toBeFocused()
      await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
    })

    test('бургер закрывает меню', async ({ page }) => {
      await openMenu(page)
      await burger(page).click()
      await expectMenuClosed(page)
    })

    test('затемнение закрывает меню', async ({ page }) => {
      await openMenu(page)
      const { height, width } = page.viewportSize()!
      // Выше панели Nuxt DevTools: на dev-сервере она перехватывает клики внизу по центру
      await page.locator('.app-header__dim').click({ position: { x: width / 2, y: height * 0.7 } })
      await expectMenuClosed(page)
    })

    test('Escape закрывает меню', async ({ page }) => {
      await openMenu(page)
      await page.keyboard.press('Escape')
      await expectMenuClosed(page)
    })

    test('Escape закрывает меню после клика по пустому месту шторки', async ({ page }) => {
      await openMenu(page)
      await page.locator('.app-header__menu').click({ position: { x: 4, y: 4 } })
      await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true)

      await page.keyboard.press('Escape')

      await expectMenuClosed(page)
    })

    test('при закрытом меню Tab идёт обычным порядком', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)
      await page.locator('.app-header__logo').focus()

      await page.keyboard.press('Tab')

      await expect(burger(page)).toBeFocused()
    })

    test('смена маршрута закрывает меню', async ({ page }) => {
      await openMenu(page, OTHER_ROUTE)
      await page.locator('.app-header__item').first().click()
      await expect(page).toHaveURL('/')
      await expectMenuClosed(page)
    })
  })
})
