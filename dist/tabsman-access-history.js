const { createElement, Suspense } = window.React;
const { Button, HoverContextMenu, Menu, MenuText } = orca.components;

// 导入核心模块
import {  getActiveTabs, generateTabNameAndIcon } from './tabsman-core.js';

/**
 * 异步菜单项组件
 * 负责异步加载历史记录项并生成菜单
 * @param {Object} props - 组件属性
 * @param {Array} props.historyItems - 历史记录项数组
 * @param {string} props.type - 菜单类型 ('back' 或 'forward')
 * @param {Function} props.close - 关闭菜单的回调函数
 * @returns {Object} 返回菜单组件
 */
function AsyncMenuItems({ historyItems, type, close }) {
    const [menuItems, setMenuItems] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    
    React.useEffect(() => {
        /**
         * 异步加载菜单项
         * 为每个历史记录项生成标题和图标
         */
        async function loadMenuItems() {
            const items = [];
            const maxItems = Math.min(historyItems.length, 5); // 最多显示5个
            for (let i = historyItems.length - 1; i >= historyItems.length - maxItems; i--) {
                const historyItem = historyItems[i];
                const blockId = historyItem.view === 'journal' 
                    ? historyItem.viewArgs?.date 
                    : historyItem.viewArgs?.blockId;
                
                const tabInfo = await generateTabNameAndIcon(blockId);
                
                items.push(createElement(MenuText, {
                    key: `${type}-${i}`,
                    title: tabInfo.name,
                    preIcon: tabInfo.icon,
                    className: `plugin-tabsman-${type}-history-tab-item`,
                    style: {
                        fontFamily: 'var(--orca-fontfamily-code)',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        maxWidth: '20em'
                    },
                    onClick: async () => {
                        close();
                        orca.nav.goTo(historyItem.view, historyItem.viewArgs);
                    }
                }));
            }
            setMenuItems(items);
            setLoading(false);
        }
        
        loadMenuItems();
    }, [historyItems, type, close]);
    
    if (loading) {
        return createElement("div", {
            className: 'plugin-tabsman-loading-state',
            style: { padding: '10px', textAlign: 'center', color: '#666' }
        }, "加载中...");
    }
    
    return createElement(Menu, {}, menuItems);
}



/**
 * 启动前进后退历史模块
 * 注册头部栏按钮，提供历史记录导航功能
 * @returns {Promise<void>} 返回Promise
 */
async function startBackAndForwardHistory() {
    orca.headbar.registerHeadbarButton("tabsman.back-history", () =>
    createElement(HoverContextMenu, {
        menu: (close) => {
            let activeTab = getActiveTabs()[orca.state.activePanel];
            if (!activeTab || activeTab.backStack.length <= 1) {
                return createElement("div", {
                    className: 'plugin-tabsman-empty-state',
                    style: { padding: '10px', textAlign: 'center', color: '#666' }
                }, "暂无后退历史");
            }
            
            // 获取历史记录（排除当前项）
            const historyItems = activeTab.backStack.slice(0, -1);
            
            return createElement(AsyncMenuItems, {
                historyItems: historyItems,
                type: 'back',
                close: close
            });
        }
    }, createElement(Button, {
        variant: "plain",
        className: "plugin-tabsman-back-button"
    }, [
        createElement("i", {
            className: "ti ti-arrow-left orca-headbar-icon",
        })
    ]))
    );
    
    orca.headbar.registerHeadbarButton("tabsman.forward-history", () =>
    createElement(HoverContextMenu, {
        menu: (close) => {
            let activeTab = getActiveTabs()[orca.state.activePanel];
            if (!activeTab || activeTab.forwardStack.length === 0) {
                return createElement("div", {
                    className: 'plugin-tabsman-empty-state',
                    style: { padding: '10px', textAlign: 'center', color: '#666' }
                }, "暂无前进历史");
            }
            
            // 获取前进历史记录
            const historyItems = activeTab.forwardStack;
            
            return createElement(AsyncMenuItems, {
                historyItems: historyItems,
                type: 'forward',
                close: close
            });
        }
    }, createElement(Button, {
        variant: "plain",
        className: "plugin-tabsman-forward-button"
    }, [
        createElement("i", {
            className: "ti ti-arrow-right orca-headbar-icon",
        })
    ]))
    );
}


/**
 * 停止前进后退历史模块
 * 注销头部栏按钮，清理相关资源
 * @returns {Promise<void>} 返回Promise
 */
async function stopBackAndForwardHistory() {
    // 注销顶部栏按钮
    orca.headbar.unregisterHeadbarButton('tabsman.back-history');
    orca.headbar.unregisterHeadbarButton('tabsman.forward-history');
    
    console.log('后退和前进历史模块已停止');
}

// 导出启动和停止函数
export { startBackAndForwardHistory, stopBackAndForwardHistory };