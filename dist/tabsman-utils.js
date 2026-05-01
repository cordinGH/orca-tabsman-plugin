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


    // 中键直接打开编辑预览
    tabElement.onpointerdown = (e) => {
        if (e.button !== 1) return
        // 存在预览窗口时，原生直接中键切换，无需额外打开。
        if (previewClose) return

        const tabRect = tabElement.getBoundingClientRect();
        const { top, right, height } = tabRect
        const fakeRect = new DOMRect(
            right, // 矩形区域的x偏移
            top + height * 0.5, // 矩形区域的y偏移
            0, // 矩形的x宽度
            0 // 矩形的y高度
        );
        orca.utils.showBlockPreview(targetBlockId, undefined, fakeRect, true);
        document.body.classList.add('plugin-tabsman-preview')
        // 下一次事件循环再监听关闭（即 忽略本次pointerdown）
        setTimeout(()=>document.addEventListener('pointerdown', handlePreviewClose), 0)
    }


    // alt + 悬停打开非编辑预览
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
            previewClose = orca.utils.showBlockPreview(targetBlockId, undefined, fakeRect, false);
            document.body.classList.add('plugin-tabsman-preview')
        }, 200) // 200ms防抖
    }

    tabElement.onmouseleave = (e) => {
        // ctrl e 打开编辑预览后，官方会立刻加入logic。
        const isEditing = document.body.classList.contains('orca-popup-pointer-logic')
        !isEditing && clearPreview()
    }
}

// 手动清除预览（alt + hover）
function clearPreview() {
    previewTimer && clearTimeout(previewTimer)
    if (!previewClose) return
    previewClose()
    previewClose = null
    // 确保彻底关闭再移除样式，100经过测试，不稳定，120 小概率不稳定，150稳定。
    setTimeout(()=>document.body.classList.remove('plugin-tabsman-preview'), 150)
}


/**
 * 控制中键打开编辑预览后的class移除
 * @param {MouseEvent} e 
 */
function handlePreviewClose(e) {
    // 但如果正常的间隔点击（点击了外部关闭弹窗，似乎并不能保证本事件触发时，官方class一定被移除，如果延迟了，那这次事件就return了，也就没有后续清理了）
    // 经过测试，官方的orca-popup-pointer-logic在移除时，可能会等待关闭动画过渡消失后，才移除class，所以150ms后再做判断（100是边界值）。
    setTimeout(()=>{
        // 防止对tab连续的中键时，弹窗打开，因为防抖导致下一次中键不触发弹窗关闭，但触发了这里clear，导致class被提前清除。
        const isEditing = document.body.classList.contains('orca-popup-pointer-logic')
        // 点击事件发生在弹窗外部，则应当清除
        const clickInOut = !e.target.closest('.orca-popup.orca-block-preview-popup');
        if (clickInOut && !isEditing) {
            document.removeEventListener('pointerdown', handlePreviewClose)
            document.body.classList.remove('plugin-tabsman-preview')
        }
    }, 150)
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