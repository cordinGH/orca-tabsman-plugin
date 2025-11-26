// tabsman全局对象（懒得导入导出·-·）
window.pluginTabsman = {}

/**
 * 【工具函数】创建一个指定类名的 DOM 元素并追加到父元素中
 * @param {string} eName - 标签名，如 'div', 'button'
 * @param {string} eClassName - 类名
 * @param {HTMLElement} parentE - 需要append进去的父元素
 * @returns {HTMLElement} 创建的元素
 */
window.pluginTabsman.createDomWithClass = function (eName, eClassName, parentE) {
    const e = document.createElement(eName)
    e.className = eClassName
    parentE.appendChild(e)
    return e
}

// 等待关闭动画结束再移除
window.pluginTabsman.closePopupwithAnimation = function (popupEle){
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