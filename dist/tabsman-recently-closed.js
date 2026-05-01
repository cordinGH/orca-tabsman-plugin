const { createElement: c, useState } = window.React;
const { Button, ContextMenu, Menu, MenuText } = orca.components;

import * as TabsmanCore from './tabsman-core.js';
import * as TabsmanPersistence from './tabsman-persistence.js';
import * as Utils from './tabsman-utils.js'

let renderTabsByPanelCallback;

function stopRecentlyClosed() {
    orca.headbar.unregisterHeadbarButton('tabsman.recently-closed');
    renderTabsByPanelCallback = null;
}

/**
 * 辅助函数，删除标签页
 * @param {Object} tab - tab对象
 * @param {string} listType - 被删除的item所在的列表类型
 * @returns {Promise<void>}
 */
async function deleteTabItem(tab, listType) {

    const current = [...TabsmanPersistence.getTabArray(listType)];
    let index = -1;
    switch (listType) {
        case 'favorite': 
            index = current.findIndex(t => t.currentBlockId.valueOf() === tab.currentBlockId.valueOf());
            break;
        case 'recently-closed': 
            index = current.findIndex(item => item.id === tab.id);
            break;
    }

    if (index === -1) return orca.notify("warn", "已经删除成功，无需再次删除");

    // 持久化之后刷新侧边栏收藏图标
    await TabsmanPersistence.removeAndSaveTab(tab, listType);
    listType === "favorite" && renderTabsByPanelCallback?.();
}

/**
 * 辅助函数，打开标签页
 * @param {Object} tab - 标签页对象
 */
async function openTabItem(tab) {
    const currentPanelId = orca.state.activePanel;
    const { view, viewArgs } = tab.backStack.at(-1);
    const newTab = await TabsmanCore.createTab({ currentBlockId: tab.currentBlockId, panelId: currentPanelId, initHistoryInfo: { view, viewArgs } })
    await TabsmanCore.switchTab(newTab.id)
}


/**
 * 历史与收藏菜单组件 ———— 点击 headbar 按钮后弹出的菜单组件
 */
function HeadbarButtonMenu() {
    const [favoriteList, setFavoriteList] = useState(() => TabsmanPersistence.getTabArray("favorite"));
    const [closedList, setClosedList] = useState(() => TabsmanPersistence.getTabArray("recently-closed"));

    return [
        c(MenuText, { key: "fav", title: "收藏的标签页", preIcon: "ti ti-star" },
            c(Menu, {},
                favoriteList.length === 0
                ? c(EmptyState, {text: "暂无收藏的标签页"})
                : favoriteList.map(tab => 
                    c(TabItem, {
                        key: tab.id, 
                        tab, 
                        onClick: () => openTabItem(tab), 
                        listType: 'favorite', 
                        setList: setFavoriteList}
                    )
                )
            )
        ),
        c(MenuText, { key: "closed", title: "最近关闭的标签页", preIcon: "ti ti-progress-x"},
            c(Menu, {}, 
                closedList.length === 0
                ? c(EmptyState, {text: "暂无关闭的标签页"})
                : closedList.map(tab => 
                    c(TabItem, {
                        key: tab.id, 
                        tab, 
                        onClick: async () => {
                            if (TabsmanCore.getTab(tab.id)) return orca.notify("warn", "该标签页已被恢复");
                            await openTabItem(tab);
                            await deleteTabItem(tab, 'recently-closed');
                            setClosedList([...TabsmanPersistence.getTabArray('recently-closed')]);   
                        }, 
                        listType: 'recently-closed', 
                        setList: setClosedList}
                    )
                )
            )
        )
    ];
}


/**
 * 列表为空时的组件
 * @param {Object} props
 * @param {string} props.text - 提示文字
 */
function EmptyState({ text }) {
    return c("div", {
        className: 'plugin-tabsman-empty-state',
        style: { textAlign: 'center', color: 'var(--orca-color-gray-5)' }
    }, text);
}

function TabItem({tab, onClick, listType, setList}) {
    return c(MenuText, {
        preIcon: tab.currentIcon || 'ti ti-cube',
        style: {cursor: 'default'},
        title: c("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' } },
            c(TabItemName, { text: tab.name }),
            c(TabItemDeleteBtn, { 
                onClick: async (e) => {
                    e.stopPropagation()
                    await deleteTabItem(tab, listType);
                    setList([...TabsmanPersistence.getTabArray(listType)]);   
                }
            })
        ),
        onClick
    })
}


/**
 * 标签页的删除按钮组件
 * @param {Object} props
 * @param {Function} props.onClick - 删除按钮的点击处理函数
 */
function TabItemDeleteBtn({ onClick }) {
    return c("i", {
        className: "ti ti-x plugin-tabsman-delete-btn",
        style: {
            cursor: 'pointer',
            opacity: 0.6,
            marginLeft: '8px',
             flexShrink: 0
        },
        onClick
    })
}

// 标签页的名称组件
function TabItemName({ text }) {
    return c("span", {
            style: {
                fontFamily: 'var(--orca-fontfamily-code)',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                maxWidth: '20em',
                flex: 1
            }
        },
        text
    )
}


function startRecentlyClosed(renderTabsByPanel) {
    // 暴露给收藏删除时调用
    renderTabsByPanelCallback = renderTabsByPanel

    orca.headbar.registerHeadbarButton("tabsman.recently-closed", () => 
        c(ContextMenu, {
            children: (open) => c(Button, 
                {
                    variant: "plugin-tabsman-fav-and-closed plain",
                    onClick: open, 
                    onMouseEnter: (e) => Utils.showTooltip(e.currentTarget, '收藏&最近关闭'),
                    onMouseLeave: () => Utils.hideTooltip()
                }, 
                c("i", {className: "ti ti-stack-pop orca-headbar-icon"})
            ),
            menu: (close) => c(HeadbarButtonMenu, { close })
        })
    );
}

export { startRecentlyClosed, stopRecentlyClosed };