const orcaHeadbarSidebarTools = document.querySelector(".orca-headbar-sidebar-tools")
const header = document.querySelector('#headbar')

/** @type {HTMLInputElement} */
let saveButton = null

/** @type {HTMLInputElement} */
let exitButton = null

/** @type {HTMLInputElement} */
let wsItems = null

/** @type {HTMLInputElement} */
let wsTools = null

/** @type {HTMLInputElement} */
let confirmPopup = null

/** @type {HTMLInputElement} */
let savePopup = null

/** @type {HTMLInputElement} */
let wsItemSelected = null

let wsItemsObj = {}

const createDomWithClass = window.pluginTabsman.createDomWithClass
const closePopupwithAnimation = window.pluginTabsman.closePopupwithAnimation

// 启动初始渲染
export async function startWSRender() {
// export async function startWSRender(lastWorkspaceName = "") {
    // 创建固定元素，保存按钮和WS容器
    wsTools = createDomWithClass("div", "plugin-tabsman-ws", orcaHeadbarSidebarTools)
    saveButton = createDomWithClass("button", "plugin-tabsman-ws-save orca-button plain", wsTools)
    createDomWithClass("i", "ti ti-device-floppy orca-headbar-icon", saveButton)
    wsItems = createDomWithClass("div", "plugin-tabsman-ws-items", wsTools)

    // 提取用户的工作区
    const allUserWS = await window.pluginTabsman.getAllWS()
    // const allUserWS = allWS.filter(item => item !== "tabsman-workspace-exit")

    // 创建userWS（选项卡）
    for(const name of allUserWS){
        appendWSItemEle(name)
    }

    // ws工具栏监听委托
    wsTools.addEventListener("pointerdown", async function (e) {
        // e.stopPropagation()
        const target = e.target
        const classList = target.classList
        if (classList.contains("plugin-tabsman-ws-items-item")) {
            if (wsItemSelected) clearWSItemSelected()
            wsItemSelected = target
            openWSByClickEle(target.dataset.pluginTabsmanWsName)
            wsItemSelected.classList.add("plugin-tabsman-ws-selected")
            return
        } else if (classList.contains("plugin-tabsman-ws-items-item-delete")) {
            if (confirmPopup?.isConnected) {
                // 说明：阻止挂在document上的关闭监听。当连接时再次点击delete只要换一下位置即可
                e.stopImmediatePropagation();
                // removePopup(confirmPopup)
                // return
            } else {
                appendConfirmPopup()
                // 加入进dom后，监听savePopup的关闭事件
                setTimeout(() => {
                    document.addEventListener('pointerdown', handleCancelConfirmPopup);
                    document.addEventListener('keydown', handleCancelConfirmPopup);
                    // orca.notify("success", "[tabsman] 添加delete监听");
                }, 0);
            }
            const wsName = target.closest(".plugin-tabsman-ws-items-item").dataset.pluginTabsmanWsName
            confirmPopup.result = wsName
            // 定位弹窗到按钮下方
            const rect = target.parentElement.getBoundingClientRect();
            confirmPopup.style.left = `${rect.left}px`;
            confirmPopup.style.top = "var(--orca-height-headbar)";
            return
        } else if (target.closest(".plugin-tabsman-ws-exit")) {
            window.pluginTabsman.exitWS()
            exitButton.remove()
            clearWSItemSelected()
            return
        } else if (target.closest(".plugin-tabsman-ws-save")) {
            if (savePopup?.isConnected) {
                // 说明：关闭事件监听会调用remove，无序重复调用
                // removePopup(savePopup)
                return
            }
            appendSavePopup()
            // 加入进dom后，监听savePopup的关闭事件
            setTimeout(() => {
                document.addEventListener('pointerdown', handleCancelSavePopup);
                document.addEventListener('keydown', handleCancelSavePopup);
                savePopup.inputActualinput.focus()
                // orca.notify("success", "[tabsman] 添加save监听");
            }, 0);   
            const rect = target.getBoundingClientRect();
            savePopup.style.left = `${rect.left}px`;
            savePopup.style.top = "var(--orca-height-headbar)";
        }
    })

    // setTimeout(() => {
    //     if (lastWorkspaceName) {
    //         const item = wsItemsObj[lastWorkspaceName]
    //         if (item) item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    //     }
    // },1000)
}

export function stopWSRender(){
    wsTools?.remove()
    if (confirmPopup?.isConnected) {
        document.removeEventListener('pointerdown', handleCancelConfirmPopup)
        document.removeEventListener('keydown', handleCancelConfirmPopup)
    }
    if (savePopup?.isConnected) {
        document.removeEventListener('pointerdown', handleCancelSavePopup)
        document.removeEventListener('keydown', handleCancelSavePopup)
    }
    wsTools = null
    saveButton = null
    exitButton = null
    wsItems = null
    confirmPopup = null
    savePopup = null
    wsItemSelected = null
    wsItemsObj = {}
}

// 工具函数，移除选中样式和选中元素记录
function clearWSItemSelected() {
    wsItemSelected.classList.remove("plugin-tabsman-ws-selected")
    wsItemSelected = null
}

// 移除工作区元素
function removeWSItemEle(name) {
    const wsItem = wsItemsObj[name]

    // 移除元素数据
    wsItem.remove()
    delete wsItemsObj[name]

    // 如果移除的当前工作区，则清除class并重置selected元素。
    if (wsItem === wsItemSelected) clearWSItemSelected()
}

// 添加工作区元素
function appendWSItemEle(name) {
    const wsItem = createDomWithClass("div", "plugin-tabsman-ws-items-item orca-segmented-item", wsItems)
    wsItem.dataset.pluginTabsmanWsName = name
    wsItem.textContent = name.slice(name.indexOf('_') + 1)
    createDomWithClass("i", "ti ti-x plugin-tabsman-ws-items-item-delete", wsItem)
    wsItemsObj[name] = wsItem
}

// 点击元素打开工作区
function openWSByClickEle(name) {
    window.pluginTabsman.openWS(name)

    // 确保存在退出点如果还没有退出点元素则先建立
    if (!exitButton) {
        // 创建退出退出点的按钮，并使得点击时清除dom并重置缓存
        exitButton = createDomWithClass("button", "plugin-tabsman-ws-exit orca-button plain", wsTools)
        createDomWithClass("i", "ti ti-plug-x orca-headbar-icon", exitButton)
    } else {
        wsTools.appendChild(exitButton)
    }
}

// 获取确认窗对象，确认窗result保存处理的wsName
async function appendConfirmPopup() {
    if (confirmPopup) {
        headbar.appendChild(confirmPopup)
        return
    }

    // 创建确认窗口
    confirmPopup = createDomWithClass("div", 'orca-popup plugin-tabsman-ws-confirm_popup', headbar)
    Object.assign(confirmPopup.style, { zIndex: '299', transformOrigin: 'left top' });

    // 弹窗的内容盒子
    const confirmBox = createDomWithClass("div", 'orca-menu orca-context-menu orca-confirm-box', confirmPopup)

    const confirmBoxMessage = createDomWithClass("div", 'orca-confirm-box-message', confirmBox)
    const confirmBoxMessageI = createDomWithClass("i", 'ti ti-alert-circle orca-confirm-box-icon', confirmBoxMessage)
    const confirmBoxMessageText = createDomWithClass("p", 'orca-confirm-box-text', confirmBoxMessage)
    confirmBoxMessageText.textContent = "请确认你要删除这个工作区！"
    const noBtn = createDomWithClass("div", 'orca-button outline', confirmBox)
    noBtn.textContent = "取消"
    const yesBtn = createDomWithClass("div", 'orca-button dangerous', confirmBox)
    yesBtn.textContent = "确认"
    noBtn.onclick = async function() {
        confirmPopup.classList.add("is-closing")
        removePopup(confirmPopup)
    };
    yesBtn.onclick = async function(){
        confirmPopup.classList.add("is-closing")
        const wsName = confirmPopup.result
        removePopup(confirmPopup)

        // 如果删除的是当前工作区，则先移除退出按钮和样式
        const deleteKind = await window.pluginTabsman.deleteWS(wsName)
        if ( deleteKind === 1) {
            exitButton.remove()
            clearWSItemSelected()
        }
        removeWSItemEle(wsName)
    };
}

// 获取保存窗对象，result属性为获取的name
async function appendSavePopup() {
    if (savePopup && !savePopup.isConnected) {
        headbar.appendChild(savePopup)
        return
    }
    // 创建save弹窗
    savePopup = createDomWithClass("div", 'orca-popup plugin-tabsman-ws-save_popup', headbar)
    Object.assign(savePopup.style, { zIndex: '299', transformOrigin: 'left top' });

    // 弹窗的命名输入区
    const saveInputBox = createDomWithClass("div", 'orca-menu orca-context-menu orca-input-box', savePopup)

    const input = createDomWithClass("span", 'orca-input', saveInputBox)
    savePopup.input = input
    const inputInput = createDomWithClass("span", 'orca-input-input', input)
    createDomWithClass("i", 'ti ti-forms orca-input-box-icon orca-input-pre', inputInput)
    const inputActualinput = createDomWithClass("input", 'orca-input-actualinput', inputInput)
    savePopup.inputActualinput = inputActualinput
    inputActualinput.placeholder = "请为新工作区命名..."
    inputActualinput.type = "text"

    // 选项按钮，选择是否仅保存当前tab
    const optionDiv = createDomWithClass("div", 'plugin-tabsman-ws-save_popup-option', saveInputBox)
    optionDiv.textContent = "仅保存当前Tab"
    Object.assign(optionDiv.style, {
        display: "flex",
        justifyContent: "space-between"
    })
    const extendBtn = createDomWithClass("button", "orca-switch", optionDiv)
    savePopup.extendBtn = extendBtn
    savePopup.onlyActiveTab = false
    const btnIcon = createDomWithClass("span", "orca-switch-toggle", extendBtn)

    // 确认按钮
    const yesBtn = createDomWithClass("button", 'orca-button solid', saveInputBox)
    yesBtn.textContent = "确定"
    yesBtn.style.color = "var(--orca-color-white)"

    // 提示高频重复创建
    const inputError = createDomWithClass("span", 'orca-input-error', input)
    savePopup.inputError = inputError
    inputError.remove()
    inputError.textContent = "1毫秒内创建多次？emmm"

    extendBtn.onclick = function(){
        savePopup.onlyActiveTab = savePopup.extendBtn.classList.toggle('orca-switch-on')
    }

    yesBtn.onclick = async function (){
        const inputValue = savePopup.inputActualinput.value
        
        // 未填写默认采用日期作为命名
        if (inputValue === "") {
            const dateToday = new Date()
            savePopup.result = String(dateToday.getMonth() + 1) + "-" + dateToday.getDate()
        } else {
            savePopup.result = inputValue
        }

        let saveReturn = null
        if (savePopup.onlyActiveTab) {
            saveReturn = await window.pluginTabsman.saveWS(savePopup.result, true)
        } else {
            saveReturn = await window.pluginTabsman.saveWS(savePopup.result)
        }

        if (saveReturn) {
            savePopup.inputActualinput.value = ""
            removePopup(savePopup)
            appendWSItemEle(saveReturn)
        } else {
            savePopup.input.classList.add("orca-input-has-error")
            savePopup.input.appendChild(savePopup.inputError)
        }
    };
}

async function handleCancelConfirmPopup(e) {
    // orca.notify("success", "[tabsman] 触发handle点击");
    if (confirmPopup.isConnected) {
        if (e.type === 'keydown' && e.key === 'Escape') removePopup(confirmPopup)
        if (e.type === 'pointerdown' && !confirmPopup.contains(e.target)) removePopup(confirmPopup)
    }
}

async function handleCancelSavePopup(e) {
    // 该回调只在appendSavePopup执行后才追加回调，因此savePopup是必然存在的
    if (savePopup.isConnected) {
        if (e.type === 'keydown' && e.key === 'Escape') removePopup(savePopup)
        if (e.type === 'pointerdown' && !savePopup.contains(e.target)) removePopup(savePopup)
    }
}

// 从dom中移除save弹窗，同时一并移除监听器
async function removePopup (popupEle){
    await closePopupwithAnimation(popupEle)
    if (popupEle === savePopup) {
        document.removeEventListener('pointerdown', handleCancelSavePopup)
        document.removeEventListener('keydown', handleCancelSavePopup)
        // 恢复按钮
        if(savePopup.onlyActiveTab) {
            savePopup.extendBtn.classList.toggle('orca-switch-on')
            savePopup.onlyActiveTab = false
        }
        // orca.notify("success", "[tabsman] 移除save监听");
    }
    if (popupEle === confirmPopup) {
        document.removeEventListener('pointerdown', handleCancelConfirmPopup)
        document.removeEventListener('keydown', handleCancelConfirmPopup)
        // orca.notify("success", "[tabsman] 移除delete监听");
    }
}