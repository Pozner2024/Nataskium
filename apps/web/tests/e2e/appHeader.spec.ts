import { expect, test, type Page } from '@playwright/test'

// Служебная страница есть только в режиме разработки, E2E идут на dev-сервере
const OTHER_ROUTE = '/nat'
const ACTIVE_ITEM_CLASS = /app-header__item--active/
const LOGIN_HEIGHT_PX = 60
const LINE_TOLERANCE_PX = 1
const TRANSPARENT = 'rgba(0, 0, 0, 0)'
const PANEL_MAX_WIDTH_PX = 320
const PANEL_WIDTH_SHARE = 0.85
const PANEL_PADDING_PX = 16
const EMPTY_PANEL_POINT = { x: 4, y: 4 }
const DIM_POINT_X_PX = 10
const EDGE_POINT_PX = 10
const SCROLLED_PAGE_PX = 400
const MENU_TAB_ORDER = [
  'Библиотека заданий',
  'Тарифные планы',
  'Вопросы и ответы',
  'Центр помощи',
  'Язык: Русский',
  'Войти',
  'Зарегистрироваться',
  'Закрыть меню',
  'Главная',
]
const WHEEL_PX = 120
const WHEEL_TURNS = 10

// До гидратации SSR-разметка на клики не реагирует. __vue_app__ не годится как сигнал:
// он появляется раньше, чем гидратируются асинхронные части, в том числе layout с шапкой
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

// Координаты панели имеют смысл только после окончания выезда
async function waitForPanel(page: Page) {
  await page.locator('.app-header__menu').evaluate(async (panel) => {
    // Без чтения стиля браузер ещё не начал анимацию и getAnimations() пуст
    void getComputedStyle(panel).transform
    await Promise.all(panel.getAnimations().map(animation => animation.finished))
  })
}

async function scrollPageDown(page: Page) {
  await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), SCROLLED_PAGE_PX)
}

function panelRect(page: Page) {
  return page.locator('.app-header__menu').evaluate((panel) => {
    const { left, right, top, bottom, width } = panel.getBoundingClientRect()
    return { left, right, top, bottom, width }
  })
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

  test('«Войти» в панели — кнопка на всю ширину панели с высотой 60px', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    await page.locator('.app-header__burger').click()
    const login = page.locator('.app-header__login')

    await expect(login).toBeVisible()
    await expect(login.locator('.app-button__arrow')).toBeVisible()
    await waitForPanel(page)
    const box = await login.boundingBox()
    const panel = await panelRect(page)
    expect(box?.height).toBe(LOGIN_HEIGHT_PX)
    expect(box!.x).toBeCloseTo(panel.left + PANEL_PADDING_PX)
    expect(box!.x + box!.width).toBeCloseTo(panel.right - PANEL_PADDING_PX)
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(box!.width).toBeGreaterThan(panel.width / 2)
  })

  test.describe('боковая панель', () => {
    async function expectPanelAtRightEdge(page: Page) {
      const { width, height } = page.viewportSize()!
      const panel = await panelRect(page)
      const bar = await page.locator('.app-header__bar').boundingBox()
      expect(panel.right).toBeCloseTo(width)
      expect(panel.width).toBeCloseTo(Math.min(PANEL_MAX_WIDTH_PX, width * PANEL_WIDTH_SHARE))
      expect(panel.top).toBeCloseTo(bar!.y + bar!.height)
      expect(panel.bottom).toBeCloseTo(height)
    }

    async function expectPanelBeyondRightEdge(page: Page) {
      const panel = await panelRect(page)
      expect(panel.left).toBeGreaterThanOrEqual(page.viewportSize()!.width)
    }

    test('закрыта за правым краем, открыта у правого края', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)
      await expectPanelBeyondRightEdge(page)

      await page.locator('.app-header__burger').click()
      await waitForPanel(page)
      await expectPanelAtRightEdge(page)

      await page.locator('.app-header__burger').click()
      await waitForPanel(page)
      await expectPanelBeyondRightEdge(page)
    })

    test('на прокрученной странице стоит под шапкой', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)
      await scrollPageDown(page)

      await page.locator('.app-header__burger').click()
      await waitForPanel(page)

      await expectPanelAtRightEdge(page)
    })

    test.describe('при reduced motion', () => {
      test.use({ contextOptions: { reducedMotion: 'reduce' } })

      test('открывается сразу, без анимации', async ({ page }) => {
        await page.goto('/')
        await waitForHydration(page)

        await page.locator('.app-header__burger').click()

        const animations = await page.locator('.app-header__menu').evaluate(panel => panel.getAnimations().length)
        expect(animations).toBe(0)
        await expectPanelAtRightEdge(page)
      })
    })

    test('продолжает пятно шапки только там, где оно есть', async ({ page }) => {
      const background = () => page.locator('.app-header__menu').evaluate(panel => getComputedStyle(panel).backgroundImage)

      await page.goto('/')
      expect(await background()).toContain('radial-gradient')

      await page.goto(OTHER_ROUTE)
      expect(await background()).not.toContain('radial-gradient')
    })

    test('линия между списками идёт на всю ширину панели, как над «Войти»', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)
      await page.locator('.app-header__burger').click()
      await waitForPanel(page)
      const secondList = page.locator('.app-header__list').nth(1)
      const auth = page.locator('.app-header__auth')
      const panel = await panelRect(page)

      const box = await secondList.boundingBox()
      expect(box!.x).toBeCloseTo(panel.left)
      expect(box!.x + box!.width).toBeCloseTo(panel.right)
      for (const property of ['border-top-style', 'border-top-width', 'border-top-color']) {
        const authValue = await auth.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)
        await expect(secondList).toHaveCSS(property, authValue)
      }
      await expect(secondList).toHaveCSS('border-top-style', 'solid')
    })

    test('Tab обходит все пункты по порядку и заканчивает на регистрации', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)
      await page.locator('.app-header__burger').click()
      await waitForPanel(page)
      await expect(page.locator('.app-header__item').first()).toBeFocused()

      const order: string[] = []
      for (let tab = 0; tab < MENU_TAB_ORDER.length; tab += 1) {
        await page.keyboard.press('Tab')
        order.push(await page.evaluate(() => {
          const active = document.activeElement!
          return active.textContent!.trim() || active.getAttribute('aria-label')!
        }))
      }

      expect(order).toEqual(MENU_TAB_ORDER)
    })

    test('строка языка отзывается на наведение', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'нужна мышь')
      await page.goto('/')
      await waitForHydration(page)
      await page.locator('.app-header__burger').click()
      await waitForPanel(page)
      const language = page.locator('.app-header__item', { hasText: 'Язык: Русский' })
      const background = () => language.evaluate(element => getComputedStyle(element).backgroundColor)
      const idle = await background()

      await language.hover()

      await expect.poll(background).not.toBe(idle)
    })

    test('клик по обычной ссылке закрывает меню, если страница осталась открытой', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)
      // Переход отменяем на document, уже после обработчика ссылки: иначе полная загрузка закрыла бы меню сама
      await page.evaluate(() => document.addEventListener('click', event => event.preventDefault()))
      const burger = page.locator('.app-header__burger')
      await burger.click()
      await waitForPanel(page)

      await page.getByRole('link', { name: 'Библиотека заданий' }).first().click()

      await expect(burger).toHaveAttribute('aria-expanded', 'false')
      await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('')
      await expect(burger).toBeFocused()
    })

    test('ссылка на будущую страницу ведёт по адресу', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)
      await page.locator('.app-header__burger').click()
      await waitForPanel(page)

      const register = page.locator('.app-header__register')
      const box = await register.boundingBox()
      // У правого края: на dev-сервере панель Nuxt DevTools перехватывает клики внизу по центру
      await register.click({ position: { x: box!.width - EDGE_POINT_PX, y: box!.height / 2 } })

      await expect(page).toHaveURL('/register')
    })
  })

  test.describe('панель на низком экране', () => {
    const LOW_SCREEN = { width: 320, height: 480 }
    // На 320×480 пункты ещё помещаются: фокусу есть куда уйти только на экране ниже
    const VERY_LOW_SCREEN = { width: 320, height: 360 }

    async function openOnLowScreen(page: Page, { scrollPage = false, screen = LOW_SCREEN } = {}) {
      await page.setViewportSize(screen)
      await page.goto('/')
      await waitForHydration(page)
      if (scrollPage) await scrollPageDown(page)
      await page.locator('.app-header__burger').click()
      await waitForPanel(page)
    }

    function scrollY(page: Page) {
      return page.evaluate(() => window.scrollY)
    }

    function groupsScrollTop(page: Page) {
      return page.locator('.app-header__groups').evaluate(groups => groups.scrollTop)
    }

    // Фокус должен быть виден: в прокручиваемых разделах — внутри видимой части, остальное прокрутке не подлежит
    function focusableCount(page: Page) {
      return page.locator('.app-header__burger, .app-header__menu a[href], .app-header__menu button').count()
    }

    function isFocusVisible(page: Page) {
      return page.evaluate(() => {
        const active = document.activeElement!
        const rect = active.getBoundingClientRect()
        const groups = document.querySelector('.app-header__groups')!
        const area = groups.contains(active) ? groups.getBoundingClientRect() : { top: 0, bottom: innerHeight }
        return rect.top >= area.top && rect.bottom <= area.bottom
      })
    }

    test('разделы прокручиваются, «Войти» на месте, страница не двигается', async ({ page }) => {
      await openOnLowScreen(page, { scrollPage: true })
      const groups = page.locator('.app-header__groups')
      const login = page.locator('.app-header__login')
      const pageScroll = await scrollY(page)
      const loginBefore = await login.boundingBox()
      expect(await groups.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)

      await groups.hover()
      await page.mouse.wheel(0, WHEEL_PX)

      await expect.poll(() => groupsScrollTop(page)).toBeGreaterThan(0)
      await expect(login).toBeInViewport({ ratio: 1 })
      await expect(page.locator('.app-header__register')).toBeInViewport({ ratio: 1 })
      expect(await login.boundingBox()).toEqual(loginBefore)
      expect(await scrollY(page)).toBe(pageScroll)
    })

    test('упор прокрутки разделов не двигает страницу', async ({ page }) => {
      await openOnLowScreen(page, { scrollPage: true })
      const pageScroll = await scrollY(page)
      await page.locator('.app-header__groups').hover()

      for (let turn = 0; turn < WHEEL_TURNS; turn += 1) await page.mouse.wheel(0, WHEEL_PX)
      await expect.poll(() => groupsScrollTop(page)).toBeGreaterThan(0)

      expect(await scrollY(page)).toBe(pageScroll)
    })

    test('при Tab по кругу фокус не уходит за край прокрутки', async ({ page }) => {
      await openOnLowScreen(page, { scrollPage: true, screen: VERY_LOW_SCREEN })
      const pageScroll = await scrollY(page)
      const tabs = await focusableCount(page) * 2

      for (let tab = 0; tab < tabs; tab += 1) {
        await page.keyboard.press('Tab')
        expect(await isFocusVisible(page)).toBe(true)
      }

      expect(await scrollY(page)).toBe(pageScroll)
    })

    test('при Shift+Tab по кругу фокус не уходит за край прокрутки', async ({ page }) => {
      await openOnLowScreen(page, { screen: VERY_LOW_SCREEN })
      const tabs = await focusableCount(page) * 2

      for (let tab = 0; tab < tabs; tab += 1) {
        await page.keyboard.press('Shift+Tab')
        expect(await isFocusVisible(page)).toBe(true)
      }
    })

    test('при повторном открытии фокус виден', async ({ page }) => {
      await openOnLowScreen(page)
      const groups = page.locator('.app-header__groups')
      await groups.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })

      await page.keyboard.press('Escape')
      await waitForPanel(page)
      await page.locator('.app-header__burger').click()
      await waitForPanel(page)

      await expect(page.locator('.app-header__item').first()).toBeFocused()
      expect(await isFocusVisible(page)).toBe(true)
    })
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
      await waitForPanel(page)
      // Слева от панели и выше Nuxt DevTools: на dev-сервере они перехватывают клики внизу по центру
      await page.locator('.app-header__dim').click({ position: { x: DIM_POINT_X_PX, y: page.viewportSize()!.height * 0.7 } })
      await expectMenuClosed(page)
    })

    test('Escape закрывает меню', async ({ page }) => {
      await openMenu(page)
      await page.keyboard.press('Escape')
      await expectMenuClosed(page)
    })

    test('Escape закрывает меню после клика по пустому месту шторки', async ({ page }) => {
      await openMenu(page)
      await waitForPanel(page)
      await page.locator('.app-header__groups').click({ position: EMPTY_PANEL_POINT })
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
