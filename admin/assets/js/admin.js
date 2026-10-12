// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    // 侧边栏折叠功能
    initSidebar();
    
    // 初始化统计图表
    initCharts();
    
    // 初始化用户表格
    initDataTables();
    
    // 初始化事件处理
    initEventHandlers();
    
    // 初始化密码强度指示器
    initPasswordStrength();
    
    // 初始化页面导航
    initFeedbackEvents();
    initNavigation();
    
    // 初始化登录记录模态框
    initUserLoginModal();
    loadXCloudHotToplist();
    loadClientEntryStatistics();
});

// 初始化侧边栏折叠功能
function initSidebar() {
    const toggleBtn = document.querySelector('.toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (toggleBtn && sidebar && mainContent) {
        // 创建遮罩层元素（如果不存在）
        let overlay = document.querySelector('.overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.classList.add('overlay');
            document.body.appendChild(overlay);
        }
        
        // 检查是否是移动设备
        let isMobile = window.innerWidth < 992;
        
        // 切换侧边栏状态的函数
        const toggleSidebar = () => {
            if (isMobile) {
                sidebar.classList.toggle('active');
                overlay.classList.toggle('active');
            } else {
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('expanded');
            }
            
            // 保存状态到本地
            if (!isMobile) {
                const isSidebarCollapsed = sidebar.classList.contains('collapsed');
                localStorage.setItem('sidebar_collapsed', isSidebarCollapsed);
            }
        };
        
        // 点击按钮切换侧边栏
        toggleBtn.addEventListener('click', toggleSidebar);
        
        // 点击遮罩层关闭侧边栏
        overlay.addEventListener('click', () => {
            if (sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            }
        });
        
        // 窗口大小改变时重新检测设备类型
        window.addEventListener('resize', () => {
            const newIsMobile = window.innerWidth < 992;
            
            // 如果设备类型改变
            if (isMobile !== newIsMobile) {
                // 清除所有可能的类
                sidebar.classList.remove('active', 'collapsed');
                mainContent.classList.remove('expanded');
                overlay.classList.remove('active');
                
                // 根据新的设备类型和保存的状态设置类
                if (!newIsMobile) {
                    const isSidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
                    if (isSidebarCollapsed) {
                        sidebar.classList.add('collapsed');
                        mainContent.classList.add('expanded');
                    }
                }
                
                // 更新设备类型
                isMobile = newIsMobile;
            }
        });
        
        // 初始化侧边栏状态
        if (!isMobile) {
            // 桌面设备：根据保存的偏好设置侧边栏状态
            const isSidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
            if (isSidebarCollapsed) {
                sidebar.classList.add('collapsed');
                mainContent.classList.add('expanded');
            }
        } else {
            // 移动设备：默认隐藏侧边栏
            sidebar.classList.remove('active');
        }
    }
    
    // 设置当前活动菜单项
    const currentPage = window.location.pathname.split('/').pop();
    const menuItems = document.querySelectorAll('.sidebar-menu a');
    
    menuItems.forEach(item => {
        if (item.getAttribute('href') === currentPage) {
            item.classList.add('active');
        }
    });
}

// 初始化页面导航功能
function initNavigation() {
    // 检查URL hash以确定应该显示哪个页面
    const hash = window.location.hash;
    if (hash === '#users') {
        showUserManagement();
    } else if (hash === '#feedback') {
        showFeedbackManagement();
    } else {
        showDashboard();
    }
    
    // 监听浏览器返回按钮等历史记录变化
    window.addEventListener('popstate', function() {
        const hash = window.location.hash;
        if (hash === '#users') {
            showUserManagement();
        } else if (hash === '#feedback') {
            showFeedbackManagement();
        } else {
            showDashboard();
        }
    });
}

// 处理邮箱验证状态变更
function handleEmailVerification(userId, action) {
    // 确认操作
    let message = '确定将该用户标记为待验证状态？用户下次登录时将收到验证邮箱的提示。';
    if (action === 'reset') {
        message = '确定将该用户重置为无需验证状态？';
    }
    
    if (!confirm(message)) {
        return;
    }
    
    // 发送请求
    const formData = new FormData();
    formData.append('user_id', userId);
    formData.append('status', action === 'verify' ? 1 : 0);
    formData.append('action', action);
    
    fetch('api/update_email_verify_status.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // 显示成功消息
            showToast(data.message, 'success');
            
            // 查找所有与此用户ID相关的按钮
            let buttons = document.querySelectorAll(`button[data-id="${userId}"]`);
            if (buttons.length > 0) {
                // 从任意按钮找到所在的行
                let row = null;
                for (let i = 0; i < buttons.length; i++) {
                    const possibleRow = buttons[i].closest('tr');
                    if (possibleRow) {
                        row = possibleRow;
                        break;
                    }
                }
                
                if (row) {
                    // 找到邮箱状态列
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 6) {
                        const statusCell = cells[5]; // 第6列是邮箱状态列（0-indexed）
                        
                        if (action === 'verify') {
                            statusCell.innerHTML = '<span class="badge bg-warning">待验证</span>';
                        } else if (action === 'reset') {
                            statusCell.innerHTML = '<span class="badge bg-secondary">无需验证</span>';
                        } else if (action === 'verified') {
                            statusCell.innerHTML = '<span class="badge bg-success">已验证</span>';
                        }
                    }
                    
                    // 更新操作按钮
                    const actionBtns = row.querySelectorAll('button');
                    for (let btn of actionBtns) {
                        // 如果是验证邮箱按钮
                        if (btn.classList.contains('verify-email-btn') && action === 'verify') {
                            btn.outerHTML = `<button class="btn btn-sm btn-secondary reset-verify-btn" data-id="${userId}">
                                <i class="bi bi-x-circle"></i> 重置验证
                            </button>`;
                            break;
                        }
                        // 如果是重置验证按钮
                        else if (btn.classList.contains('reset-verify-btn') && action === 'reset') {
                            btn.outerHTML = `<button class="btn btn-sm btn-warning verify-email-btn" data-id="${userId}">
                                <i class="bi bi-envelope-check"></i> 邮箱验证
                            </button>`;
                            break;
                        }
                    }
                }
            } else {
                // 如果找不到按钮，刷新页面
                location.reload();
            }
        } else {
            showToast(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('操作失败，请稍后重试', 'error');
    });
}

// 显示控制台页面
function showDashboard() {
    document.getElementById('page-title').textContent = '控制台';
    document.getElementById('dashboard-content').style.display = 'block';
    document.getElementById('users-content').style.display = 'none';
    document.getElementById('feedback-content').style.display = 'none';
    
    // 更新活动菜单项
    document.querySelectorAll('.sidebar-menu a').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById('dashboard-link').classList.add('active');
    
    // 更新URL，不触发页面刷新
    history.pushState(null, '', '#dashboard');
}

// 显示用户管理页面
function showUserManagement() {
    document.getElementById('page-title').textContent = '用户管理';
    document.getElementById('dashboard-content').style.display = 'none';
    document.getElementById('users-content').style.display = 'block';
    document.getElementById('feedback-content').style.display = 'none';
    
    // 更新活动菜单项
    document.querySelectorAll('.sidebar-menu a').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById('users-link').classList.add('active');
    
    // 更新URL，不触发页面刷新
    history.pushState(null, '', '#users');
    
    // 刷新表格以确保正确显示
    if ($.fn.DataTable.isDataTable('#userTable')) {
        $('#userTable').DataTable().columns.adjust().draw();
    }
}

let feedbackPage = 1;
let feedbackTotalPages = 1;
let feedbackItems = [];
let feedbackReplyDraft = '';

function showFeedbackManagement() {
    document.getElementById('page-title').textContent = '反馈处理';
    document.getElementById('dashboard-content').style.display = 'none';
    document.getElementById('users-content').style.display = 'none';
    document.getElementById('feedback-content').style.display = 'block';
    document.querySelectorAll('.sidebar-menu a').forEach((item) => item.classList.remove('active'));
    document.getElementById('feedback-link').classList.add('active');
    if (window.location.hash !== '#feedback') history.pushState(null, '', '#feedback');
    loadFeedbackPage(feedbackPage);
}

function initFeedbackEvents() {
    const previous = document.getElementById('feedback-prev');
    const next = document.getElementById('feedback-next');
    const form = document.getElementById('feedback-reply-form');
    if (previous) previous.addEventListener('click', () => loadFeedbackPage(feedbackPage - 1));
    if (next) next.addEventListener('click', () => loadFeedbackPage(feedbackPage + 1));
    if (form) form.addEventListener('submit', submitFeedbackReply);
}

async function loadFeedbackPage(page) {
    const body = document.getElementById('feedback-table-body');
    if (!body || page < 1) return;
    body.replaceChildren(feedbackMessageRow('正在加载...'));
    try {
        const response = await fetch(`api/get_feedback.php?page=${page}`, { headers: { Accept: 'application/json' } });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || '反馈列表加载失败');
        feedbackPage = Number(data.page) || 1;
        feedbackTotalPages = Number(data.total_pages) || 1;
        feedbackItems = Array.isArray(data.items) ? data.items : [];
        renderFeedbackTable();
        document.getElementById('feedback-total').textContent = `${Number(data.total) || 0} 条`;
        document.getElementById('feedback-page-info').textContent = `第 ${feedbackPage} / ${feedbackTotalPages} 页`;
        document.getElementById('feedback-prev').disabled = feedbackPage <= 1;
        document.getElementById('feedback-next').disabled = feedbackPage >= feedbackTotalPages;
        const warning = document.getElementById('feedback-warning');
        const invalidCount = Number(data.invalid_count) || 0;
        warning.style.display = invalidCount > 0 ? 'block' : 'none';
        warning.textContent = invalidCount > 0 ? `已跳过 ${invalidCount} 条损坏或不完整的反馈记录。` : '';
    } catch (error) {
        console.error('Failed to load feedback:', error);
        body.replaceChildren(feedbackMessageRow(error.message || '反馈列表加载失败', 'text-danger'));
    }
}

function feedbackMessageRow(message, className = 'text-muted') {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = `text-center py-4 ${className}`;
    cell.textContent = message;
    row.appendChild(cell);
    return row;
}

function renderFeedbackTable() {
    const body = document.getElementById('feedback-table-body');
    body.replaceChildren();
    if (feedbackItems.length === 0) {
        body.appendChild(feedbackMessageRow('暂无反馈记录'));
        return;
    }
    feedbackItems.forEach((item) => body.appendChild(createFeedbackRow(item)));
}

function createFeedbackRow(item) {
    const row = document.createElement('tr');
    const time = document.createElement('td');
    time.className = 'feedback-time';
    time.textContent = formatFeedbackTime(item.submitted_at);
    const message = document.createElement('td');
    const summary = document.createElement('div');
    summary.className = 'feedback-message feedback-summary';
    summary.textContent = item.message;
    message.appendChild(summary);
    const email = document.createElement('td');
    email.className = 'feedback-email';
    email.textContent = item.email || '未提供';
    const status = document.createElement('td');
    status.appendChild(createFeedbackStatus(item));
    const actions = document.createElement('td');
    actions.className = 'feedback-actions';
    actions.appendChild(feedbackActionButton('查看详情', 'bi-eye', 'btn-outline-secondary', () => openFeedbackDetail(item)));
    if (item.email) actions.appendChild(feedbackActionButton('回复反馈', 'bi-reply', 'btn-primary', () => openFeedbackReply(item)));
    row.append(time, message, email, status, actions);
    return row;
}

function createFeedbackStatus(item) {
    const wrapper = document.createElement('div');
    const badge = document.createElement('span');
    badge.className = `badge ${item.replied ? 'bg-success' : 'bg-warning text-dark'}`;
    badge.textContent = item.replied ? '已回复' : '未回复';
    wrapper.appendChild(badge);
    if (item.replied_at) {
        const detail = document.createElement('small');
        detail.className = 'd-block text-muted mt-1';
        detail.textContent = formatFeedbackTime(item.replied_at);
        wrapper.appendChild(detail);
    }
    return wrapper;
}

function feedbackActionButton(label, icon, style, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-sm ${style}`;
    button.title = label;
    const iconNode = document.createElement('i');
    iconNode.className = `bi ${icon}`;
    button.append(iconNode, document.createTextNode(` ${label}`));
    button.addEventListener('click', handler);
    return button;
}

function openFeedbackDetail(item) {
    document.getElementById('feedback-detail-time').textContent = formatFeedbackTime(item.submitted_at);
    document.getElementById('feedback-detail-email').textContent = item.email || '未提供';
    document.getElementById('feedback-detail-status').replaceChildren(createFeedbackStatus(item));
    document.getElementById('feedback-detail-message').textContent = item.message;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('feedbackDetailModal')).show();
}

function openFeedbackReply(item) {
    document.getElementById('feedback-reply-id').value = item.id;
    document.getElementById('feedback-reply-email').value = item.email;
    document.getElementById('feedback-reply-message').value = feedbackReplyDraft;
    document.getElementById('feedback-reply-error').textContent = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('feedbackReplyModal')).show();
}

async function submitFeedbackReply(event) {
    event.preventDefault();
    const id = document.getElementById('feedback-reply-id').value;
    const textarea = document.getElementById('feedback-reply-message');
    const errorNode = document.getElementById('feedback-reply-error');
    const submit = document.getElementById('feedback-reply-submit');
    feedbackReplyDraft = textarea.value;
    if (!feedbackReplyDraft.trim()) {
        errorNode.textContent = '请输入回复内容。';
        return;
    }
    submit.disabled = true;
    errorNode.textContent = '';
    try {
        const response = await fetch('api/reply_feedback.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                feedback_id: id,
                reply: feedbackReplyDraft,
                csrf_token: document.getElementById('admin-csrf-token').content,
            }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || '回复邮件发送失败');
        const item = feedbackItems.find((entry) => entry.id === id);
        if (item) {
            item.replied = true;
            item.replied_at = data.replied_at;
        }
        feedbackReplyDraft = '';
        textarea.value = '';
        bootstrap.Modal.getInstance(document.getElementById('feedbackReplyModal'))?.hide();
        renderFeedbackTable();
        showToast('回复邮件已发送', 'success');
    } catch (error) {
        console.error('Failed to reply to feedback:', error);
        errorNode.textContent = error.message || '回复邮件发送失败，请稍后重试';
    } finally {
        submit.disabled = false;
    }
}

function formatFeedbackTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString('zh-CN', { hour12: false });
}

// 初始化统计图表
function initCharts() {
    // 登录统计图表
    const loginChartElement = document.getElementById('loginChart');
    if (loginChartElement) {
        const loginData = JSON.parse(loginChartElement.getAttribute('data-stats'));
        
        const dates = Object.keys(loginData);
        const counts = Object.values(loginData);
        
        // 格式化日期显示
        const formattedDates = dates.map(date => {
            const d = new Date(date);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        });
        
        new Chart(loginChartElement, {
            type: 'line',
            data: {
                labels: formattedDates,
                datasets: [{
                    label: '每日用户登录数',
                    data: counts,
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(52, 152, 219, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    const playbackSourceChartElement = document.getElementById('playbackSourceChart');
    if (playbackSourceChartElement) {
        try {
            const sourceStats = JSON.parse(playbackSourceChartElement.getAttribute('data-stats') || '{}');
            updatePlaybackSourceChart(sourceStats);
        } catch (error) {
            console.error('解析播放源统计数据失败:', error);
        }
    }
}

// 初始化DataTables表格
function initDataTables() {
    const userTable = document.getElementById('userTable');
    if (userTable) {
        new DataTable('#userTable', {
            language: {
                url: '/vendor/datatables/zh.json',
            },
            responsive: true,
            order: [[0, 'asc']], // 默认按ID正序排列
            columnDefs: [
                { targets: -1, orderable: false } // 禁用最后一列排序（操作列）
            ]
        });
    }
}

// 初始化所有事件处理
function initEventHandlers() {
    // 刷新数据按钮点击事件
    const refreshBtn = document.getElementById('refresh-data');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            refreshDashboardData();
        });
    }
    
    // 查看详细登录统计按钮
    const viewStatsBtn = document.getElementById('view-login-statistics');
    if (viewStatsBtn) {
        viewStatsBtn.addEventListener('click', function() {
            openLoginStatistics(7); // 默认查看7天数据
        });
    }
    
    // 查看所有登录记录按钮
    const viewAllLoginsBtn = document.getElementById('view-all-logins');
    if (viewAllLoginsBtn) {
        viewAllLoginsBtn.addEventListener('click', function() {
            openLoginModal();
        });
    }
    
    // 统计时间范围切换
    document.addEventListener('click', function(e) {
        if (e.target && e.target.closest('.time-range-btn')) {
            const btn = e.target.closest('.time-range-btn');
            const days = parseInt(btn.dataset.days);
            
            // 更新活跃状态
            document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 重新加载数据
            fetchLoginStatistics(days);
        }
    });
    
    // 编辑用户按钮点击事件（使用事件委托）
    document.addEventListener('click', function(e) {
        if (e.target && e.target.closest('.edit-user-btn')) {
            const btn = e.target.closest('.edit-user-btn');
            const userId = btn.dataset.id;
            fetchUserData(userId);
        }
    });
    
    // 查看登录记录按钮点击事件（使用事件委托）
    document.addEventListener('click', function(e) {
        if (e.target && e.target.closest('.view-login-btn')) {
            const btn = e.target.closest('.view-login-btn');
            const userId = btn.dataset.id;
            fetchUserLoginHistory(userId);
        }
    });
    
    // 邮箱验证按钮点击事件（使用事件委托）
    document.addEventListener('click', function(e) {
        if (e.target && e.target.closest('.verify-email-btn')) {
            const btn = e.target.closest('.verify-email-btn');
            const userId = btn.dataset.id;
            handleEmailVerification(userId, 'verify');
        }
    });
    
    // 重置验证按钮点击事件（使用事件委托）
    document.addEventListener('click', function(e) {
        if (e.target && e.target.closest('.reset-verify-btn')) {
            const btn = e.target.closest('.reset-verify-btn');
            const userId = btn.dataset.id;
            handleEmailVerification(userId, 'reset');
        }
    });
    
    // 编辑用户表单提交事件
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitUserEdit();
        });
    }
    
    // 修改密码表单提交事件
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitPasswordChange();
        });
    }
}

// 获取用户数据
function fetchUserData(userId) {
    // 显示加载状态
    const modalBody = document.querySelector('#editUserModal .modal-body');
    modalBody.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">加载中...</span></div></div>';
    
    // 显示模态框
    const editModal = new bootstrap.Modal(document.getElementById('editUserModal'));
    editModal.show();
    
    // 发送AJAX请求获取用户数据
    fetch(`api/get_user.php?id=${userId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateEditUserForm(data.user);
            } else {
                showToast('获取用户数据失败：' + data.message, 'error');
                editModal.hide();
            }
        })
        .catch(error => {
            console.error('获取用户数据错误:', error);
            showToast('获取用户数据时发生错误', 'error');
            editModal.hide();
        });
}

// 更新编辑用户表单
function updateEditUserForm(user) {
    const form = document.getElementById('editUserForm');
    const modalBody = document.querySelector('#editUserModal .modal-body');
    
    modalBody.innerHTML = `
        <div class="mb-3">
            <label for="userId" class="visually-hidden">用户ID</label>
            <input type="hidden" class="form-control" id="userId" name="userId" value="${user.id}">
        </div>
        <div class="mb-3">
            <label for="username" class="form-label">用户名</label>
            <input type="text" class="form-control" id="username" name="username" value="${user.username}">
        </div>
        <div class="mb-3">
            <label for="email" class="form-label">邮箱地址</label>
            <input type="email" class="form-control" id="email" name="email" value="${user.email || ''}">
        </div>
        <div class="mb-3">
            <label for="newPassword" class="form-label">修改密码（留空表示不修改）</label>
            <input type="password" class="form-control" id="newPassword" name="newPassword">
            <div class="password-strength mt-2">
                <div class="password-strength-bar"></div>
            </div>
            <small class="text-muted">密码强度指示</small>
        </div>
        <div class="mb-3">
            <label class="form-label">注册时间</label>
            <p>${new Date(user.created_at).toLocaleString()}</p>
        </div>
        <div class="mb-3">
            <label class="form-label">最后登录</label>
            <p>${user.last_login ? new Date(user.last_login).toLocaleString() : '从未登录'}</p>
        </div>
    `;
    
    // 重新初始化密码强度指示器
    initPasswordStrength();
}

// 提交用户编辑
function submitUserEdit() {
    const form = document.getElementById('editUserForm');
    const userId = document.getElementById('userId').value;
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const newPassword = document.getElementById('newPassword').value;
    
    console.log('提交用户编辑', {userId, username, email, password: newPassword ? '已填写' : '未填写'});
    
    // 表单验证
    if (!username) {
        showToast('用户名不能为空', 'error');
        return;
    }
    
    // 准备数据
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('username', username);
    formData.append('email', email);
    if (newPassword) {
        formData.append('password', newPassword);
    }
    
    // 显示加载状态
    const submitBtn = document.querySelector('#editUserModal .btn-primary');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 保存中...';
    }
    
    // 提交AJAX请求
    fetch('api/update_user.php', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        console.log('响应状态:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('响应数据:', data);
        
        // 恢复按钮状态
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '保存修改';
        }
        
        if (data.success) {
            // 隐藏模态框
            const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
            if (modal) modal.hide();
            
            // 显示成功消息
            showToast(data.message, 'success');
            
            // 刷新页面以更新数据
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            showToast(data.message || '更新用户失败，请重试', 'error');
        }
    })
    .catch(error => {
        // 恢复按钮状态
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '保存修改';
        }
        
        console.error('更新用户数据错误:', error);
        showToast('更新用户数据时发生错误', 'error');
    });
}

// 提交密码修改
function submitPasswordChange() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newAdminPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // 表单验证
    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('所有密码字段都不能为空', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('新密码与确认密码不匹配', 'error');
        return;
    }
    
    // 准备数据
    const formData = new FormData();
    formData.append('currentPassword', currentPassword);
    formData.append('newPassword', newPassword);
    
    // 提交AJAX请求
    fetch('api/change_admin_password.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // 清空表单
            document.getElementById('changePasswordForm').reset();
            
            // 显示成功消息
            showToast(data.message, 'success');
        } else {
            showToast(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('修改密码错误:', error);
        showToast('修改密码时发生错误', 'error');
    });
}

// 显示消息提示
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    // 设置样式类
    let bgClass = 'bg-info';
    if (type === 'success') bgClass = 'bg-success';
    if (type === 'error') bgClass = 'bg-danger';
    if (type === 'warning') bgClass = 'bg-warning';
    
    toast.innerHTML = `
        <div class="toast-header ${bgClass} text-white">
            <strong class="me-auto">系统消息</strong>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
            ${message}
        </div>
    `;
    
    document.querySelector('.toast-container').appendChild(toast);
    
    const bsToast = new bootstrap.Toast(toast, {
        delay: 3000
    });
    bsToast.show();
    
    // 自动移除元素
    toast.addEventListener('hidden.bs.toast', function () {
        this.remove();
    });
}

// 初始化密码强度指示器
function initPasswordStrength() {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        if (input.id === 'currentPassword' || input.id === 'confirmPassword') {
            return; // 跳过当前密码和确认密码字段
        }
        
        input.addEventListener('input', function() {
            const password = this.value;
            const strengthBar = this.parentElement.querySelector('.password-strength-bar');
            
            if (!strengthBar) return;
            
            // 移除所有强度类
            strengthBar.classList.remove('strength-weak', 'strength-medium', 'strength-strong');
            
            // 计算密码强度
            if (password.length === 0) {
                strengthBar.style.width = '0';
            } else {
                let strength = 0;
                
                // 长度检查
                if (password.length >= 8) strength += 1;
                // 包含字母和数字
                if (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) strength += 1;
                // 包含特殊字符
                if (/[^a-zA-Z0-9]/.test(password)) strength += 1;
                
                if (strength === 1) {
                    strengthBar.classList.add('strength-weak');
                } else if (strength === 2) {
                    strengthBar.classList.add('strength-medium');
                } else if (strength === 3) {
                    strengthBar.classList.add('strength-strong');
                }
            }
        });
    });
}

// 刷新仪表盘数据
function refreshDashboardData() {
    // 显示加载动画
    const refreshBtn = document.getElementById('refresh-data');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 刷新中...';
    }
    
    // 刷新页面内容
    fetch(window.location.pathname + '?refresh=1')
        .then(response => response.text())
        .then(html => {
            // 提取新的统计数据
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 更新统计卡片
            const statValues = doc.querySelectorAll('.stat-value');
            const currentStatValues = document.querySelectorAll('.stat-value');
            statValues.forEach((statValue, index) => {
                if (currentStatValues[index]) {
                    currentStatValues[index].textContent = statValue.textContent;
                }
            });
            
            // 更新最近登录用户列表
            const recentLoginsNew = doc.querySelector('.col-md-4 .card .list-group');
            const recentLoginsOld = document.querySelector('.col-md-4 .card .list-group');
            if (recentLoginsNew && recentLoginsOld) {
                recentLoginsOld.innerHTML = recentLoginsNew.innerHTML;
                
                // 重新绑定编辑按钮事件
                document.querySelectorAll('.edit-user-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const userId = this.getAttribute('data-id');
                        fetchUserData(userId);
                    });
                });
            }
            
            // 更新图表数据
            const chartElement = doc.getElementById('loginChart');
            if (chartElement) {
                const chartData = JSON.parse(chartElement.getAttribute('data-stats'));
                updateLoginChart(chartData);
            }

            // 更新播放源占比图、总播放次数和统计明细
            const sourceChartElement = doc.getElementById('playbackSourceChart');
            if (sourceChartElement) {
                const sourceStats = JSON.parse(sourceChartElement.getAttribute('data-stats') || '{}');
                updatePlaybackSourceChart(sourceStats);
            }
            const sourceTotalNew = doc.getElementById('playback-source-total');
            const sourceTotalOld = document.getElementById('playback-source-total');
            if (sourceTotalNew && sourceTotalOld) {
                sourceTotalOld.textContent = sourceTotalNew.textContent;
            }
            const sourceBodyNew = doc.getElementById('playback-source-stats-body');
            const sourceBodyOld = document.getElementById('playback-source-stats-body');
            if (sourceBodyNew && sourceBodyOld) {
                sourceBodyOld.innerHTML = sourceBodyNew.innerHTML;
            }
            loadClientEntryStatistics();
            
            // 如果当前在用户管理页面，更新用户表格
            if (window.location.hash === '#users') {
                const userTableNew = doc.querySelector('#userTable tbody');
                if (userTableNew) {
                    // 销毁现有DataTable实例
                    if ($.fn.DataTable.isDataTable('#userTable')) {
                        $('#userTable').DataTable().destroy();
                    }
                    
                    // 更新表格内容
                    document.querySelector('#userTable tbody').innerHTML = userTableNew.innerHTML;
                    
                    // 重新初始化DataTable
                    initDataTables();
                    
                    // 重新绑定编辑按钮事件
                    document.querySelectorAll('.edit-user-btn').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const userId = this.getAttribute('data-id');
                            fetchUserData(userId);
                        });
                    });
                }
            }
            
            // 显示成功消息
            showToast('数据已刷新', 'success');
        })
        .catch(error => {
            console.error('刷新数据错误:', error);
            showToast('刷新数据时发生错误', 'error');
        })
        .finally(() => {
            // 恢复按钮状态
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
            }
        });
}

// 更新播放源使用占比图
function updatePlaybackSourceChart(stats) {
    const chartElement = document.getElementById('playbackSourceChart');
    if (!chartElement || !window.Chart) return;

    const chartInstance = Chart.getChart(chartElement);
    if (chartInstance) chartInstance.destroy();

    const sources = Array.isArray(stats && stats.sources) ? stats.sources : [];
    const hasData = sources.some(item => Number(item.play_count) > 0);
    const colors = ['#2ecc71', '#12a4d9', '#e74c3c', '#f39c12', '#9b59b6', '#95a5a6'];

    new Chart(chartElement, {
        type: 'doughnut',
        data: {
            labels: hasData ? sources.map(item => item.name) : ['暂无数据'],
            datasets: [{
                data: hasData ? sources.map(item => Number(item.play_count) || 0) : [1],
                backgroundColor: hasData ? sources.map((item, index) => colors[index % colors.length]) : ['#e9ecef'],
                borderColor: '#ffffff',
                borderWidth: 3,
                hoverOffset: hasData ? 8 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: {
                    display: hasData,
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 18
                    }
                },
                tooltip: {
                    enabled: hasData,
                    callbacks: {
                        label(context) {
                            const item = sources[context.dataIndex];
                            return item
                                ? ` ${item.name}：${Number(item.play_count).toLocaleString()} 次（${Number(item.percentage).toFixed(2)}%）`
                                : '';
                        }
                    }
                }
            }
        }
    });
}

// 更新登录趋势图
function updateLoginChart(chartData) {
    const chartElement = document.getElementById('loginChart');
    if (chartElement && window.Chart) {
        // 获取已存在的Chart实例
        const chartInstance = Chart.getChart(chartElement);
        if (chartInstance) {
            // 销毁现有Chart实例
            chartInstance.destroy();
        }
        
        // 从数据中提取日期和计数
        const dates = Object.keys(chartData);
        const counts = Object.values(chartData);
        
        // 格式化日期显示
        const formattedDates = dates.map(date => {
            const d = new Date(date);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        });
        
        // 创建新的Chart实例
        new Chart(chartElement, {
            type: 'line',
            data: {
                labels: formattedDates,
                datasets: [{
                    label: '每日用户登录数',
                    data: counts,
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(52, 152, 219, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
}

// 初始化用户登录模态框
function initUserLoginModal() {
    // 登录记录查询表单提交事件
    const loginSearchForm = document.getElementById('loginSearchForm');
    if (loginSearchForm) {
        loginSearchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const userId = document.getElementById('search-user-id').value;
            const startDate = document.getElementById('search-start-date').value;
            const endDate = document.getElementById('search-end-date').value;
            
            fetchLoginHistory(userId, startDate, endDate);
        });
    }
}

// 获取用户登录历史
function fetchUserLoginHistory(userId) {
    // 显示模态框
    const loginModal = new bootstrap.Modal(document.getElementById('userLoginModal'));
    loginModal.show();
    
    // 清空搜索表单并预填充用户ID
    document.getElementById('search-user-id').value = userId;
    document.getElementById('search-start-date').value = '';
    document.getElementById('search-end-date').value = '';
    
    // 获取该用户的登录历史
    fetchLoginHistory(userId);
}

// 获取登录历史记录
function fetchLoginHistory(userId, startDate = null, endDate = null) {
    // 显示加载状态
    document.getElementById('login-records').innerHTML = `
        <tr>
            <td colspan="5" class="text-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">加载中...</span>
                </div>
                <p class="mt-2">正在加载登录记录...</p>
            </td>
        </tr>
    `;
    
    // 隐藏用户信息和图表
    document.getElementById('user-info-container').style.display = 'none';
    document.getElementById('login-chart-container').style.display = 'none';
    
    // 构建查询URL
    let url = `api/get_login_history.php`;
    const params = new URLSearchParams();
    if (userId) params.append('user_id', userId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (params.toString()) url += `?${params.toString()}`;
    
    // 发送AJAX请求
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 更新登录记录计数
                document.getElementById('login-record-count').textContent = `${data.count}条记录`;
                
                // 显示用户信息（如果有）
                if (data.user) {
                    document.getElementById('user-info-container').style.display = 'block';
                    document.getElementById('user-detail-id').textContent = data.user.id;
                    document.getElementById('user-detail-username').textContent = data.user.username;
                    document.getElementById('user-detail-email').textContent = data.user.email || '无';
                    document.getElementById('user-detail-last-login').textContent = 
                        data.user.last_login ? new Date(data.user.last_login).toLocaleString() : '从未登录';
                }
                
                // 显示登录统计图表（如果有）
                if (data.stats) {
                    document.getElementById('login-chart-container').style.display = 'block';
                    updateUserLoginChart(data.stats);
                }
                
                // 更新登录记录表格
                const records = data.data;
                if (records.length > 0) {
                    let html = '';
                    records.forEach(record => {
                        html += `
                            <tr>
                                <td>${record.id}</td>
                                <td>
                                    <div class="d-flex align-items-center">
                                        <i class="bi bi-person-circle me-2"></i>
                                        ${record.username} (ID: ${record.user_id})
                                    </div>
                                </td>
                                <td>${new Date(record.login_time).toLocaleString()}</td>
                                <td>${record.ip_address}</td>
                                <td title="${record.user_agent}">${truncateString(record.user_agent, 40)}</td>
                            </tr>
                        `;
                    });
                    document.getElementById('login-records').innerHTML = html;
                } else {
                    document.getElementById('login-records').innerHTML = `
                        <tr>
                            <td colspan="5" class="text-center">没有找到匹配的登录记录</td>
                        </tr>
                    `;
                }
            } else {
                showToast(data.message, 'error');
                document.getElementById('login-records').innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center">获取登录记录失败</td>
                    </tr>
                `;
            }
        })
        .catch(error => {
            console.error('获取登录记录错误:', error);
            showToast('获取登录记录时发生错误', 'error');
            document.getElementById('login-records').innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">获取登录记录失败</td>
                </tr>
            `;
        });
}

// 更新用户登录图表
function updateUserLoginChart(loginStats) {
    const chartElement = document.getElementById('userLoginChart');
    if (chartElement && window.Chart) {
        // 获取已存在的Chart实例
        const chartInstance = Chart.getChart(chartElement);
        if (chartInstance) {
            // 销毁现有Chart实例
            chartInstance.destroy();
        }
        
        // 从数据中提取日期和计数
        const dates = Object.keys(loginStats);
        const counts = Object.values(loginStats);
        
        // 格式化日期显示
        const formattedDates = dates.map(date => {
            const d = new Date(date);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        });
        
        // 创建新的Chart实例
        new Chart(chartElement, {
            type: 'line',
            data: {
                labels: formattedDates,
                datasets: [{
                    label: '登录次数',
                    data: counts,
                    backgroundColor: 'rgba(46, 204, 113, 0.2)',
                    borderColor: 'rgba(46, 204, 113, 1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(46, 204, 113, 1)',
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: function(tooltipItems) {
                                const index = tooltipItems[0].dataIndex;
                                return dates[index];
                            }
                        }
                    }
                }
            }
        });
    }
}

// 截断字符串功能
function truncateString(str, maxLength) {
    if (str.length > maxLength) {
        return str.substring(0, maxLength) + '...';
    }
    return str;
}

// 打开登录模态框
function openLoginModal() {
    const loginModal = new bootstrap.Modal(document.getElementById('userLoginModal'));
    
    // 重置表单
    document.getElementById('search-user-id').value = '';
    document.getElementById('search-start-date').value = '';
    document.getElementById('search-end-date').value = '';
    
    // 隐藏用户信息和图表
    document.getElementById('user-info-container').style.display = 'none';
    document.getElementById('login-chart-container').style.display = 'none';
    
    // 清空登录记录
    document.getElementById('login-records').innerHTML = `
        <tr>
            <td colspan="5" class="text-center">请选择查询条件</td>
        </tr>
    `;
    document.getElementById('login-record-count').textContent = '0条记录';
    
    loginModal.show();
}

// 打开登录统计模态框
function openLoginStatistics(days = 7) {
    const statsModal = new bootstrap.Modal(document.getElementById('loginStatsModal'));
    
    // 设置活跃按钮
    document.querySelectorAll('.time-range-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.days) === days) {
            btn.classList.add('active');
        }
    });
    
    // 显示模态框
    statsModal.show();
    
    // 获取数据
    fetchLoginStatistics(days);
}

// 获取登录统计数据
function fetchLoginStatistics(days = 7) {
    // 显示加载状态
    document.getElementById('stats-total-users').textContent = '--';
    document.getElementById('stats-active-users').textContent = '--';
    document.getElementById('stats-active-percentage').textContent = '--';
    document.getElementById('top-users-list').innerHTML = `
        <li class="list-group-item text-center">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">加载中...</span>
            </div>
        </li>
    `;
    
    // 获取数据
    fetch(`api/get_login_statistics.php?days=${days}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 更新统计数字
                document.getElementById('stats-total-users').textContent = data.total_users;
                document.getElementById('stats-active-users').textContent = data.active_users;
                document.getElementById('stats-active-percentage').textContent = data.active_percentage + '%';
                
                // 更新最活跃用户列表
                updateTopUsersList(data.top_users);
                
                // 更新图表
                updateDetailedLoginChart(data.daily_stats);
            } else {
                showToast(data.message || '获取统计数据失败', 'error');
            }
        })
        .catch(error => {
            console.error('获取登录统计错误:', error);
            showToast('获取登录统计时发生错误', 'error');
        });
}

// 更新最活跃用户列表
function updateTopUsersList(users) {
    if (!users || users.length === 0) {
        document.getElementById('top-users-list').innerHTML = `
            <li class="list-group-item text-center">暂无数据</li>
        `;
        return;
    }
    
    let html = '';
    users.forEach((user, index) => {
        html += `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center">
                    <span class="badge bg-primary rounded-pill me-2">${index + 1}</span>
                    <div>
                        <div>${user.username}</div>
                        <small class="text-muted">用户ID: ${user.id}</small>
                    </div>
                </div>
                <span class="badge bg-info rounded-pill">${user.login_count}次登录</span>
            </li>
        `;
    });
    document.getElementById('top-users-list').innerHTML = html;
}

// 更新详细登录图表
function updateDetailedLoginChart(data) {
    const chartElement = document.getElementById('detailedLoginChart');
    if (!chartElement || !window.Chart) return;
    
    // 获取已存在的Chart实例
    const chartInstance = Chart.getChart(chartElement);
    if (chartInstance) {
        // 销毁现有Chart实例
        chartInstance.destroy();
    }
    
    // 准备数据
    const dates = data.map(item => item.date);
    const totalLogins = data.map(item => item.total_logins);
    const uniqueUsers = data.map(item => item.unique_users);
    
    // 格式化日期显示
    const formattedDates = dates.map(date => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    
    // 创建新的Chart实例
    new Chart(chartElement, {
        type: 'line',
        data: {
            labels: formattedDates,
            datasets: [
                {
                    label: '总登录次数',
                    data: totalLogins,
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2,
                    tension: 0.4,
                    yAxisID: 'y',
                    fill: true
                },
                {
                    label: '独立登录用户',
                    data: uniqueUsers,
                    backgroundColor: 'rgba(46, 204, 113, 0.2)',
                    borderColor: 'rgba(46, 204, 113, 1)',
                    borderWidth: 2,
                    tension: 0.4,
                    yAxisID: 'y',
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            const index = tooltipItems[0].dataIndex;
                            return dates[index];
                        }
                    }
                }
            }
        }
    });
}

async function loadClientEntryStatistics(days = 30) {
    const status = document.getElementById('client-entry-status');
    try {
        const response = await fetch(`api/get_client_entry_statistics.php?days=${days}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '获取终端访问统计失败');

        ['web', 'desktop', 'android'].forEach((type) => {
            const item = data.summary?.[type] || { visits: 0, unique_visitors: 0 };
            const today = data.today_summary?.[type] || { visits: 0 };
            const visits = document.getElementById(`client-entry-${type}-visits`);
            const totalVisits = document.getElementById(`client-entry-${type}-30d-visits`);
            const users = document.getElementById(`client-entry-${type}-users`);
            if (visits) visits.textContent = Number(today.visits || 0).toLocaleString();
            if (totalVisits) totalVisits.textContent = Number(item.visits || 0).toLocaleString();
            if (users) users.textContent = Number(item.unique_visitors || 0).toLocaleString();
        });

        if (status) status.textContent = data.table_ready ? `最近 ${data.days} 天数据` : '统计表尚未初始化，请执行客户端访问统计 SQL。';
        updateClientEntryTrendChart(data.daily_stats || []);
    } catch (error) {
        console.error('获取终端访问统计失败:', error);
        if (status) status.textContent = '终端访问统计暂时无法加载';
    }
}

function updateClientEntryTrendChart(rows) {
    const chartElement = document.getElementById('clientEntryTrendChart');
    if (!chartElement || !window.Chart) return;
    const existing = Chart.getChart(chartElement);
    if (existing) existing.destroy();
    const labels = rows.map((row) => row.date?.slice(5) || '');
    const types = [
        ['web', '网页端', '#3498db'],
        ['desktop', '桌面程序', '#8e44ad'],
        ['android', '安卓 APP', '#2ecc71'],
    ];
    new Chart(chartElement, {
        type: 'line',
        data: {
            labels,
            datasets: types.map(([key, label, color]) => ({
                label,
                data: rows.map((row) => Number(row[key]?.unique_visitors || 0)),
                borderColor: color,
                backgroundColor: `${color}22`,
                borderWidth: 2,
                tension: 0.35,
                pointRadius: 2,
                fill: false,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            plugins: { legend: { position: 'top' } },
        },
    });
}

async function loadXCloudHotToplist() {
    const tbody = document.getElementById('xcloud-hot-toplist-body');
    const updatedAt = document.getElementById('xcloud-hot-updated-at');
    if (!tbody) return;

    const sourceNames = {
        netease: '网易',
        kuwo: '酷我',
        kuwo_backup: '酷我',
        kugou: '酷狗',
        qq: 'QQ音乐'
    };

    try {
        const response = await fetch('api/get_xcloud_hot_toplist.php');
        const data = await response.json();
        const songs = Array.isArray(data.data) ? data.data.slice(0, 100) : [];

        if (updatedAt) {
            updatedAt.textContent = data.updated_at ? `更新时间：${data.updated_at}` : '缓存未生成';
        }

        if (songs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">暂无听歌历史排行数据</td></tr>';
            return;
        }

        tbody.innerHTML = songs.map((song, index) => {
            const rank = Number(song.rank || index + 1);
            const title = escapeHtml(song.name || song.title || '未知歌曲');
            const artist = escapeHtml(song.artist || '未知歌手');
            const source = sourceNames[String(song.source || '').toLowerCase()] || escapeHtml(song.source || '未知');
            const plays = Number(song.play_count || song.listen_count || 0);
            const listeners = Number(song.listener_count || 0);
            return `
                <tr>
                    <td><span class="badge bg-primary">${rank}</span></td>
                    <td>
                        <div class="fw-semibold">${title}</div>
                        <small class="text-muted">${artist}</small>
                    </td>
                    <td>${source}</td>
                    <td>${plays}</td>
                    <td>${listeners}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load XCloud hot toplist:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">加载 XCloud 热歌榜失败</td></tr>';
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
