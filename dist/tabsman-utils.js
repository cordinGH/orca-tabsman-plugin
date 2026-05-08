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


/**
 * 启用悬浮预览
 * @param {HTMLElement} tabElement - 标签页元素
 * @param {Object} tab - tab对象
 * @returns 
 */
let previewClose;
let previewTimer;
export async function enableBlockPreview(/** @type {HTMLElement} */ tabElement, tab) {

    // 按住alt 时，tab元素触发悬停预览（可编辑模式）
    const blockId = tab.currentBlockId

    let targetBlockId;
    if (blockId instanceof Date) {
        // journal
        const journalBlock = await orca.invokeBackend("get-journal-block", blockId);
        targetBlockId = journalBlock.id;
    } else if (Number.isInteger(Number(blockId))) {
        // block
        targetBlockId = blockId
    } else {
        orca.notify("info", '[tabsman] 无法触发悬停预览，因为非块')
    }


    // 中键直接打开编辑预览，不考虑防抖，因为防抖有响应延迟
    // 也无需节流防止连点，因为第一次中键时官方会立刻加上orca-popup-pointer-logic禁止点击事件，所以第二次点击根本无效
    tabElement.onpointerdown = (e) => {
        // 非中键
        if (e.button !== 1) return;

        // 存在悬停预览时，官方原生就支持中键进入编辑模式，无需重复打开。
        if (previewClose) return;

        const tabRect = tabElement.getBoundingClientRect();
        const { top, right, height } = tabRect
        const fakeRect = new DOMRect(
            right, // 矩形区域的x偏移
            top + height * 0.5, // 矩形区域的y偏移
            0, // 矩形的x宽度
            0 // 矩形的y高度
        );

        // 选择器会在class加入后立刻生效，而不会等待执行栈清空，因此class先add进去
        document.body.classList.add('plugin-tabsman-preview')
        orca.utils.showBlockPreview(targetBlockId, undefined, fakeRect, true);
        
        // 下一次事件循环再处理class移除，即 忽略本次pointerdown，防止秒开秒关
        setTimeout(()=>document.addEventListener('pointerdown', handlePreviewClass), 0)
    }


    // alt + hover，打开悬停预览
    tabElement.onmouseenter = (e) => {
        if (!e.altKey) return
        clearPreview()
        previewTimer = setTimeout(()=>{
            const tabRect = tabElement.getBoundingClientRect();
            const { top, bottom, right, left, width, height } = tabRect
            const fakeRect = new DOMRect(
                right, // 矩形区域的x偏移
                top + height * 0.5, // 矩形区域的y偏移
                0, // 矩形的x宽度
                0 // 矩形的y高度
            );

            // 选择器会在class加入后立刻生效，而不会等待执行栈清空，因此class先add进去
            document.body.classList.add('plugin-tabsman-preview')
            previewClose = orca.utils.showBlockPreview(targetBlockId, undefined, fakeRect, false);
        }, 200) // 200ms防抖
    }

    
    // 悬停预览转为编辑预览后，官方会自动加入orca-popup-pointer-logic（用于禁止外部点击），因此光标离开时如果是编辑态，则无需关闭窗口。
    // 官方的ctrl e 或者中键，都会触发光标离开
    tabElement.onmouseleave = (e) => {
        // 本没有预览则无需处理
        if (!previewClose) return

        const isEditing = document.body.classList.contains('orca-popup-pointer-logic')
        if (isEditing) return;
        
        clearPreview()
    }
}

// 清除alt hover的悬浮预览，在光标移出时手动调用
function clearPreview() {
    previewTimer && clearTimeout(previewTimer)
    if (!previewClose) return
    previewClose()
    previewClose = null
    // 确保彻底关闭再remove位移class，100经过测试不稳定，120 小概率不稳定，150稳定。
    setTimeout(()=>document.body.classList.remove('plugin-tabsman-preview'), 150)
}


/**
 * 绑在document确保能够接收事件。
 * 用于处理class plugin-tabsman-preview的移除，该class用于对预览窗口平移
 * 虎鲸的编辑预览会在点击外部区域后自动关闭预览，关闭后应当撤销对预览窗口的平移
 * @param {MouseEvent} e 
 */
function handlePreviewClass(e) {
    setTimeout(()=>{
        // 点击内部不移除
        if (e.target.closest('.orca-popup.orca-block-preview-popup')) return
        
        // 用户连续中键(如双击中键)，第一次中键触发了tabsman的中键预览并注册了本handler。
        // 理想情况是，第二次中键时触发官方的关闭预览（移除logic class），然后本处理器setTimeout滞后移除class
        // 但事实是官方会忽略第二次中键（不会关闭预览），因此需要本handler自行处理该情况下的class维持（不清理class）
        if (document.body.classList.contains('orca-popup-pointer-logic')) return

        document.removeEventListener('pointerdown', handlePreviewClass)
        document.body.classList.remove('plugin-tabsman-preview')
    }, 300) // 确保晚移除，300足够在下次打开前移除了
}


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


// ————————————————————————————————————————————封装防抖函数，复用————————————————————————————————————————————————————
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