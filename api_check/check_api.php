<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API 可用性检查</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
            background: #f5f5f5;
            margin: 0;
            padding: 15px;
            user-select: none;
        }
        
        .container {
            background: white;
            border-radius: 8px;
            padding: 20px;
            max-width: 100%;
        }
        
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 20px;
            font-size: 20px;
        }
        
        .table-wrapper {
            overflow-x: auto;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
        }
        
        thead {
            background: #667eea;
            color: white;
        }
        
        th {
            padding: 10px 12px;
            text-align: center;
            font-weight: 600;
            font-size: 14px;
        }
        
        td {
            padding: 10px 12px;
            border-bottom: 1px solid #eee;
            font-size: 14px;
            text-align: center;
        }
        
        tbody tr:hover {
            background-color: #f8f9fa;
        }
        
        tbody tr:last-child td {
            border-bottom: none;
        }
        
        .status-indicator {
            display: inline-block;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            margin-right: 6px;
            vertical-align: middle;
        }
        
        .status-true {
            background-color: #28a745;
            box-shadow: 0 0 10px rgba(40, 167, 69, 0.5);
        }
        
        .status-false {
            background-color: #dc3545;
            box-shadow: 0 0 10px rgba(220, 53, 69, 0.5);
        }
        
        .status-null {
            background-color: #6c757d;
            box-shadow: 0 0 10px rgba(108, 117, 125, 0.5);
        }

        .status-na {
            background-color: #adb5bd;
        }
        
        .status-text {
            vertical-align: middle;
            color: #333;
            font-weight: 500;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
            font-size: 16px;
        }
        
        .last-check {
            text-align: center;
            margin-top: 15px;
            color: #666;
            font-size: 12px;
        }
        
        .error {
            text-align: center;
            padding: 20px;
            color: #dc3545;
            background: #f8d7da;
            border-radius: 8px;
            margin-top: 20px;
        }
        
        @keyframes pulse {
            0%, 100% {
                opacity: 1;
            }
            50% {
                opacity: 0.5;
            }
        }
        
        .status-indicator.status-null {
            animation: pulse 2s infinite;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>API 可用性检查</h1>
        <div id="content">
            <div class="loading">正在加载数据...</div>
        </div>
    </div>

    <script>
        async function loadAPIStatus() {
            try {
                const configResponse = await fetch('../php/public_config.php', { cache: 'no-store' });
                if (!configResponse.ok) throw new Error('站点配置加载失败');
                const config = await configResponse.json();
                const sources = ['netease', 'kuwo', 'qq', 'kugou'].filter(source => config.features?.sources?.[source] === true);
                if (!sources.length) {
                    document.getElementById('content').textContent = '当前未启用任何音源';
                    return;
                }
                const response = await fetch('api_doubtful.php', { cache: 'no-store' });
                
                if (!response.ok) {
                    throw new Error('获取数据失败');
                }
                
                const data = await response.json();
                
                // 构建表格
                let html = '<div class="table-wrapper">';
                html += '<table>';
                html += '<thead>';
                html += '<tr>';
                html += '<th>音乐源</th>';
                html += '<th>搜索功能</th>';
                html += '<th>播放功能</th>';
                html += '</tr>';
                html += '</thead>';
                html += '<tbody>';
                
                // 按顺序显示各音乐源
                let latestCheck = null;
                
                sources.forEach(source => {
                    const info = data[source];
                    if (info && info.last_check) {
                        if (!latestCheck || info.last_check > latestCheck) {
                            latestCheck = info.last_check;
                        }
                    }
                    
                    html += '<tr>';
                    html += `<td><strong>${info ? info.name : source}</strong></td>`;
                    
                    // 搜索功能
                    html += '<td>';
                    const searchStatus = info ? info.search : null;
                    html += getStatusIndicator(searchStatus);
                    html += '</td>';
                    
                    // 播放功能
                    html += '<td>';
                    const playStatus = info ? info.play : null;
                    html += getStatusIndicator(playStatus);
                    html += '</td>';
                    
                    html += '</tr>';
                });
                
                html += '</tbody>';
                html += '</table>';
                html += '</div>';
                
                if (latestCheck) {
                    html += `<div class="last-check">最后检查时间: ${latestCheck}</div>`;
                }
                
                document.getElementById('content').innerHTML = html;
                
            } catch (error) {
                document.getElementById('content').innerHTML = 
                    `<div class="error">加载失败: ${error.message}</div>`;
            }
        }
        
        function getStatusIndicator(status) {
            let className = 'status-indicator status-null';
            let text = '未知';
            
            if (status === 'true') {
                className = 'status-indicator status-true';
                text = '正常';
            } else if (status === 'false') {
                className = 'status-indicator status-false';
                text = '异常';
            } else if (status === 'doubtful') {
                className = 'status-indicator status-null';
                text = '检查中';
            } else if (status === 'not_applicable') {
                className = 'status-indicator status-na';
                text = '不适用';
            }
            
            return `<span class="${className}"></span><span class="status-text">${text}</span>`;
        }
        
        // 页面加载时获取数据
        loadAPIStatus();
        
        // 每30分钟自动刷新
        setInterval(loadAPIStatus, 1800000);
    </script>
</body>
</html>

