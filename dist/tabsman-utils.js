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
        }, 150)
    }

    tabElement.onmouseleave = (e) => {
        const isEditing = document.body.classList.contains('orca-popup-pointer-logic')
        !isEditing && clearPreview(e)
    }
}

function clearPreview() {
    previewTimer && clearTimeout(previewTimer)
    if (!previewClose) return
    previewClose()
    previewClose = null
    // 确保彻底关闭再移除样式，＜150打开间隔即可
    setTimeout(()=>document.body.classList.remove('plugin-tabsman-preview'),100)
}