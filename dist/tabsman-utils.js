/**
 * 【工具函数】创建一个指定类名的 DOM 元素并追加到父元素中
 * @param {string} eName - 标签名，如 'div', 'button'
 * @param {string} eClassName - 类名
 * @param {HTMLElement} parentE - 需要append进去的父元素
 * @returns {HTMLElement} 创建的元素
 */
export function createDomWithClass(eName, eClassName, parentE) {
    const e = document.createElement(eName)
    e.className = eClassName
    parentE.appendChild(e)
    return e
}

// 等待关闭动画结束再移除
export function closePopupwithAnimation(popupEle){
    return new Promise(resolve => {
        popupEle.classList.add("is-closing")
        popupEle.addEventListener('animationend', () => {
            popupEle.remove()
            resolve();
            popupEle.classList.remove("is-closing")
            }, { once: true }
        );
    })
}

// 弹窗定位到顶部栏的按钮下方
export function setPopupPosition(popupEle, buttonEle){
    const rect = buttonEle.getBoundingClientRect();
    popupEle.style.left = `${rect.left}px`;
    popupEle.style.top = `${rect.bottom + 6}px`;
    // popupEle.style.top = "var(--orca-height-headbar)";
}


// 获取一个toolTip弹窗
let tooltipPopup;
export function getTooltipPopup() {

    if (tooltipPopup) return tooltipPopup;

    tooltipPopup = document.createElement('div')
    tooltipPopup.className = 'orca-popup plugin-tabsman-tooltip-popup'

    tooltipPopup.setAttribute('contenteditable', 'false');
    Object.assign(tooltipPopup.style, {
        position: 'fixed',
        zIndex: '499',
        transformOrigin: 'center top',
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap'
    });

    const inner = createDomWithClass('div', 'orca-tooltip', tooltipPopup)
    inner.setAttribute('contenteditable', 'false');

    return tooltipPopup;
}


/**
 * 显示 tooltip
 * @param {HTMLElement} buttonEle - 触发的按钮元素
 * @param {string} text tooltip需要显示的文本
 */
let timer = null
export function showTooltip(buttonEle, text) {
    // 清除计时器并移除tooltip
    hideTooltip();
    // 防抖
    timer = setTimeout(() => {
        document.body.appendChild(getTooltipPopup())
        // 更新文本，并将定位到按钮下方
        // tooltipPopup.querySelector('.orca-tooltip').innerHTML = text;
        tooltipPopup.querySelector('.orca-tooltip').textContent = text;
        setPopupPosition(tooltipPopup, buttonEle)
        timer = null
    }, 100)

}

export function hideTooltip() {
    // 防止滞留
    timer && clearTimeout(timer);
    timer = null;
    tooltipPopup && tooltipPopup.remove();
}


/* ———————————————————————————————————————————————————— 标签页预览 —————————————————————————————————————————————————————————— */


// 块预览的所有相关逻辑，全部闭包进blockPreview中，外部只通过 enableBlockPreview 绑定事件
const blockPreview = (() => {
    // 悬停预览的一次打开代号，await RPC后打开预览之前，需要检查代号是否过时，过时应当中止打开。
    let hoverGen = 0
    // 悬停预览防抖
    let openTimer = null
    // 悬停预览的关闭函数
    let close = null
    // 位移class移除的滞后计时器
    let classHideTimer = null
    
    // 排一个延迟500ms后再移除class的计时器，留足时间盖过官方关闭动画，防止位移闪烁
    function scheduleHideClass() {
        // 取消旧计时器
        cancelScheduledHide()
        classHideTimer = setTimeout(() => document.body.classList.remove('plugin-tabsman-preview'), 500)
    }
    // 取消任何“待移除”的位移 class，每次打开预览时都应当调用，防止位移闪烁。
    function cancelScheduledHide() {
        clearTimeout(classHideTimer)
        classHideTimer = null
    }
    
    // 取消“尚未弹出”的悬停打开，每次有新的预览/移除时，都应当调用，防止双预览
    function cancelPendingOpen() {
        // 一次预览打开的代号，每次有新的预览/移除事件发生时，代号都会自增，当await RPC发现代号过时，届时会中止预览打开。
        hoverGen++
        clearTimeout(openTimer)
        openTimer = null
    }

    function armOutsideClose() {
        document.addEventListener('pointerdown', onOutsideClose)
        document.addEventListener('keydown', onOutsideClose)
    }
    function disarmOutsideClose() {
        document.removeEventListener('pointerdown', onOutsideClose)
        document.removeEventListener('keydown', onOutsideClose)
    }

    // handler：编辑态预览关闭后，滞后移除位移class，并清理监听器
    function onOutsideClose(e) {
        // 非关闭动作则不处理
        const isEsc = e.type === 'keydown' && e.key === 'Escape'
        const isClick = e.type === 'pointerdown'
        if (!isEsc && !isClick) return;
        if (e.target.closest('.orca-popup.orca-block-preview-popup')) return;

        // 关闭动作，排期移除位移class，并清理状态
        scheduleHideClass()
        disarmOutsideClose()
        close = null
    }

    // 获取预览窗口显示位置的参考锚点
    function __getAnchorRect(tabElement) {
        const { top, right, height } = tabElement.getBoundingClientRect();
        // 参考点坐标取标签页的右边缘垂直中点
        const x = right
        const y = top + height * 0.5
        return new DOMRect(x, y, 0, 0);
    }


    // 共用：捕获代号 → await → 代号过期/非块就收尾返回 null
    // 【为什么需要 hoverGen —— 双预览bug】
    // 预览的「开」动作openTimer，被内部的await切成了两段执行
    //  - 「开」的第1段：防抖结束执行openTimer => await提前返回 => 本次 openTimer 执行完毕
    //  - 「开」的第2段：等到await的promise敲定后，await回调（预览打开）才加入微任务队列（自动）
    // 由于openTimer在第1段已执行完毕，所以如果在第2段之前派发了新onLeave/openHover/openEdit，那其内部cancelPendingOpen实际上是无效的；
    // 这就导致了本该被cancel的预览，被继续打开了，但close变量只有一个，导致另一个预览窗口常驻屏幕。
    // 
    // 【修复】
    //  - await 前记下本次 hover 代号 startGen，任何更晚的开/关事件，都会在 cancelPendingOpen 里推进 hoverGen；
    //  - await后（打开预览之前）如果代号变了，则直接return中止预览打开，以弥补 cancelPendingOpen 漏洞。
    async function __resolveBlockIdForPreview(tab) {
        const startGen = hoverGen
        const blockId = await __getBlockId(tab)
        if (startGen !== hoverGen) return null
        if (blockId === -1) {
            orca.notify("info", '[tabsman] 无法触发预览，因为非块')
            // 没开成预览则把开头 cancelScheduledHide 取消掉的那次 class 移除补排回来。
            scheduleHideClass()
            return null
        }
        return blockId
    }

    return {
        // alt + 悬停：带 200ms 防抖的悬停打开
        openHover(tab, el) {
            // 取消任何“尚未弹出”的悬停打开，避免双预览
            cancelPendingOpen()
            // 取消任何“待移除”的位移 class，避免位移闪烁
            cancelScheduledHide()

            openTimer = setTimeout(async () => {

                const blockId = await __resolveBlockIdForPreview(tab)
                if (blockId === null) return;

                // css规则的生效不是js线程，因此会在class加入后立刻生效（不会等待执行栈清空）
                document.body.classList.add('plugin-tabsman-preview')
                close = orca.utils.showBlockPreview(blockId, undefined, __getAnchorRect(el), false, true)
            }, 200)
        },


        // 中键标签页的事件处理器，用于打开一个编辑预览
        async openEdit(event, tab, el) {
            cancelPendingOpen()
            cancelScheduledHide()

            // 已有悬停预览则先关闭
            if (close) { close(); close = null }

            event.preventDefault()
            // 停止传播，从而防止本次 pointerdown 冒泡到官方挂在上层的移除预览监听器（会有可能导致秒开秒关）。
            event.stopImmediatePropagation()
            const blockId = await __resolveBlockIdForPreview(tab)
            if (blockId === null) return

            document.body.classList.add('plugin-tabsman-preview')
            orca.utils.showBlockPreview(blockId, undefined, __getAnchorRect(el), true)
            armOutsideClose()
        },


        // 鼠标离开的事件处理器，用于中止预览，并重置class状态
        onLeave() {
            // 取消尚未弹出的悬停打开
            cancelPendingOpen()

            // case1: 如果已通过虎鲸官方快捷键（ctrl+e）转为编辑态，则无需处理预览关闭（官方会接管outsideClose），只需安排关闭监听以处理位移class的移除。
            if (document.body.classList.contains('orca-popup-pointer-logic')) {
                close = null
                // 当中键转换时，openEdit事件task率先执行，随后才是onLeave事件task，
                // 而onLeave可能会在openEdit内部计时器回调之前执行，但不影响，因为addEventListener不会重复挂载，
                armOutsideClose()
                return
            }

            // case2: 正常的悬停预览，则关闭预览，并滞后移除位移 class
            if (close) { close(); close = null }
            scheduleHideClass()
        },
    }
})()


/**
 * 启用标签页的块预览：alt+悬停弹出悬停预览，中键弹出编辑态预览。
 * @param {HTMLElement} tabElement - 标签页元素
 * @param {Object} tab - tab 对象
 */
export function enableBlockPreview(tabElement, tab) {
    tabElement.onpointerdown = (e) => { if (e.button === 1) blockPreview.openEdit(e, tab, tabElement) }
    tabElement.onmouseenter = (e) => { if (e.altKey) blockPreview.openHover(tab, tabElement) }
    tabElement.onmouseleave = () => blockPreview.onLeave()
}


/**
 * 从Tab对象中获取BlockId用于悬浮预览
 */
async function __getBlockId(tab) {

    const blockId = tab.currentBlockId

    let targetBlockId;
    if (blockId instanceof Date) {
        // journal
        const journalBlock = await orca.invokeBackend("get-journal-block", blockId);
        targetBlockId = journalBlock.id;
    } else if (Number.isInteger(Number(blockId))) {
        // block
        targetBlockId = await orca.invokeBackend("get-block", blockId) ? blockId : -1
    } else {
        targetBlockId = -1
    }

    return targetBlockId
}


/* ————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————— */

/**
 * 根据orca.state.panels的中的后代结构，获取一个有序的面板Id数组。
 * @returns {string[]} 所有 ViewPanel 的 ID 列表
 */
export function getPanelIdsInOrder() {
    // 根据面板的children关系排序面板。
    const panelIds = []
    const processPanel = (panel) => {
        const { id, view, viewArgs } = panel || {}
        if (view && viewArgs) {
            panelIds.push(id)
        } else if (panel?.children) {
            panel.children.forEach(child => processPanel(child))
        }
    }
    processPanel(orca.state.panels)
    return panelIds
}


// ————————————————————————————————————————————防抖和节流包装函数————————————————————————————————————————————————————
export function debounce(fn, delay = 0) {
    let timer = null;
    return (...args) => {
        timer && clearTimeout(timer)
        timer = setTimeout(() => {
            fn(...args);
            timer = null;
        }, delay)
    }
}

export function throttle(fn, interval = 0) {
    let last = 0;
    return (...args) => {
        const now = Date.now();
        if (now - last >= interval) {
            last = now;
            fn(...args);
        }
    };
}

/* ——————————————————————————————————————— FLIP 动画过渡 ————————————————————————————————————— */

/**
 * 为一组元素的位置变化添加平滑过渡动画
 * @param {Element[]} elements 需要追踪位移的元素集合
 * @param {() => void} mutate 同步执行 DOM 变更的回调
 * @param {Object} [options]
 * @param {number} [options.duration=180] - 动画时长(ms)
 * @param {string} [options.easing='ease-out'] - 缓动函数
 *
 */
export function withFlip(elements, mutate, {duration = 120, easing = 'ease-out'} = {}) {
    const firstRects = new Map()
    elements.forEach(el => firstRects.set(el, el.getBoundingClientRect()))

    mutate()

    elements.forEach(el => {
        const firstRect = firstRects.get(el)
        const lastRect = el.getBoundingClientRect()
        const dx = firstRect.left - lastRect.left
        const dy = firstRect.top - lastRect.top

        if (dx === 0 && dy === 0) return

        el.animate(
            [
                {transform: `translate(${dx}px, ${dy}px)`},
                {transform: `translate(0, 0)`},
            ],
            {duration, easing}
        )
    })
}