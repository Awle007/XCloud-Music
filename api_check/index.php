<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="/gw.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/gw.png">
    <link rel=" android-chrome" sizes="192x192" href="/gw.png">
    <link rel="android-chrome" sizes="512x512" href="/gw.png">
    <title>XCloud音乐API可用性检查</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        /* 顶部导航栏 */
        .header {
            background: white;
            border-radius: 12px;
            padding: 20px 30px;
            margin-bottom: 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .logo-container {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .logo-container img {
            height: 45px;
            width: auto;
        }
        
        .logo-container h1 {
            font-size: 28px;
            font-weight: 700;
            color: #333;
            margin: 0;
        }
        
        .api-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        
        .api-button img {
            height: 20px;
            width: auto;
            margin-right: 8px;
            margin-bottom: -3px;
        }
        
        .api-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        }
        
        .api-button:active {
            transform: translateY(0);
        }
        
        /* iframe 容器 */
        .iframe-container {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        
        .iframe-container h2 {
            font-size: 20px;
            margin-bottom: 15px;
            color: #333;
        }
        
        .iframe-wrapper {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
            background: #f5f5f5;
        }
        
        .iframe-wrapper iframe {
            width: 100%;
            border: none;
            display: block;
            min-height: 314px;
        }
        
        /* 代码示例区域 */
        .code-section {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        
        .code-section h2 {
            font-size: 24px;
            margin-bottom: 20px;
            color: #333;
        }
        
        .code-block {
            background: #1e1e1e;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            overflow-x: auto;
            position: relative;
        }
        
        .code-block code {
            color: #d4d4d4;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.6;
            white-space: pre;
        }
        
        .copy-button {
            position: absolute;
            top: 10px;
            right: 10px;
            background: #667eea;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
        }
        
        .copy-button:hover {
            background: #5568d3;
        }
        
        /* 说明文本框 */
        .info-section {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        
        .info-section h2 {
            font-size: 24px;
            margin-bottom: 20px;
            color: #333;
        }
        
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px 20px;
            margin-bottom: 15px;
            border-radius: 4px;
        }
        
        .info-box h3 {
            font-size: 18px;
            margin-bottom: 10px;
            color: #333;
        }
        
        .info-box p {
            color: #666;
            line-height: 1.8;
            margin-bottom: 10px;
        }
        
        .info-box ul {
            color: #666;
            line-height: 1.8;
            padding-left: 20px;
        }
        
        .info-box li {
            margin-bottom: 8px;
        }
        
        .info-box img {
            height: 20px;
            width: auto;
            margin-right: 8px;
            margin-bottom: -3px;
        }
        
        /* 思维导图样式 */
        .flowchart {
            margin-top: 20px;
        }
        
        .flow-item {
            position: relative;
            margin-bottom: 20px;
            padding-left: 0;
        }
        
        .flow-item:last-child::after {
            display: none;
        }
        
        .flow-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 8px;
            font-weight: 600;
            margin-bottom: 10px;
        }
        
        .flow-number {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            font-weight: bold;
            font-size: 16px;
        }
        
        .flow-content {
            margin-left: 38px;
            padding: 15px;
            background: white;
            border-left: 3px solid #667eea;
            border-radius: 5px;
        }

        .flow-content-button {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
        }
        
        .flow-branches {
            margin-left: 0;
            margin-top: 10px;
        }
        
        .flow-branch {
            padding: 10px 15px;
            margin-bottom: 8px;
            background: #f8f9fa;
            border-left: 3px solid #28a745;
            border-radius: 5px;
            font-size: 14px;
        }
        
        .flow-branch.negative {
            border-left-color: #dc3545;
        }
        
        .delay-info {
            display: inline-block;
            padding: 4px 8px;
            background: #fff3cd;
            color: #856404;
            border-radius: 4px;
            font-size: 12px;
            margin-top: 5px;
        }
        
        /* 响应式设计 */
        @media (max-width: 768px) {
            .header {
                flex-direction: column;
                gap: 15px;
            }
            
            .logo-container h1 {
                font-size: 24px;
            }
            
            .api-button {
                width: 100%;
                text-align: center;
            }
            
            .code-section,
            .info-section {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- 顶部导航栏 -->
        <div class="header">
            <div class="logo-container">
                <img src="/gw.png" alt="XCloud Logo">
                <h1>XCloud音乐API可用性检查</h1>
            </div>
            <a href="https://api.example.com/api.php" target="_blank" class="api-button">
                <img src="/gw.png" alt="GD Studio">
                GD Studio's API入口
            </a>
        </div>
        
        <!-- iframe 容器 -->
        <div class="iframe-container">
            <h2>GD Studio's API 可用性状态</h2>
            <div class="iframe-wrapper">
                <iframe src="/api_check/check_api.php" 
                        title="API 可用性检查" 
                        loading="lazy"></iframe>
            </div>
        </div>
        
        <!-- 代码示例区域 -->
        <div class="code-section">
            <h2>使用示例</h2>
            
            <div class="code-block">
                <button class="copy-button" onclick="copyCode(this, 'iframe-code')">复制</button>
                <code id="iframe-code">&lt;iframe src="https://example.com/api_check/check_api.php" 
    width="100%" 
    height="314px" 
    frameborder="0" 
    style="border-radius: 8px; border: 1px solid #e0e0e0;"&gt;
&lt;/iframe&gt;</code>
            </div>
        </div>
        
        <!-- 说明文本框 -->
        <div class="info-section">
            <h2>API 说明</h2>
            
            <div class="info-box">
                <h3><img src="/gw.png" alt="GD Studio">关于GD Studio's API</h3>
                <p>GD Studio提供免费的音乐 API 服务，支持多个音乐源，包括网易云音乐、酷我音乐等。</p>
                <p>API由GD Studio开发，仅供学习研究使用，请勿用于商业用途。</p>
            </div>
            
            <div class="info-box">
                <h3><img src="/gw.png" alt="GD Studio">XCloud音乐API可用性检查服务说明</h3>
                <p>本服务由XCloud提供，仅供学习研究使用，请勿用于商业用途。</p>
                <p>API检查频率：0点-6点每三小时检查一次，6点-18点每一小时检查一次，18点-24点每半小时检查一次。</p>
                <div class="flowchart">
                    <div class="flow-item">
                        <div class="flow-header">
                            <span class="flow-number">1</span>
                            初始化检查任务
                        </div>
                        <div class="flow-content">
                            开始API可用性检查任务，初始化结果存储结构
                        </div>
                    </div>
                    
                    <div class="flow-item">
                        <div class="flow-header">
                            <span class="flow-number">2</span>
                            第一阶段：初次检查
                        </div>
                        <div class="flow-content">
                            依次检查网易、酷我、QQ音乐三个音乐源
                            <div class="flow-branches">
                                <div class="flow-branch">▪ 搜索功能检查（请求搜索API）<span class="delay-info">间隔1秒</span></div>
                                <div class="flow-branch">▪ 播放功能检查（按各音乐源的实际协议请求播放接口）<span class="delay-info">间隔1秒</span></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flow-item">
                        <div class="flow-header">
                            <span class="flow-number">3</span>
                            判断检查结果
                        </div>
                        <div class="flow-content">
                            <div class="flow-branches">
                                <div class="flow-branch">✓ 返回有数据 → 标记为 true（正常）</div>
                                <div class="flow-branch negative">✗ 返回为空 → 标记为 doubtful（可疑）</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flow-item">
                        <div class="flow-header">
                            <span class="flow-number">4</span>
                            可疑结果二次检查
                        </div>
                        <div class="flow-content">
                            对所有 doubtful 结果进行二次验证
                            <div class="flow-branches">
                                <div class="flow-branch">▪ 等待30秒后进行二次检查</div>
                                <div class="flow-branch">▪ 再次检查返回数据<span class="delay-info">间隔1秒</span></div>
                                <div class="flow-branch">✓ 有数据 → 标记为 true</div>
                                <div class="flow-branch negative">✗ 仍为空 → 标记为 false（异常）</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flow-item">
                        <div class="flow-header">
                            <span class="flow-number">5</span>
                            保存检查结果 
                        </div>
                        <div class="flow-content">
                            将最终结果保存到<a href="https://example.com/api_check/api_doubtful.php" target="_blank" class="flow-content-button">api_doubtful.php</a>，供前端页面展示
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="info-box">
                <h3>⚠️ 免责声明</h3>
                <p>本站资源来自网络，仅限学习参考，严禁下载、传播或商用。使用本 API 请注明出处，尊重原作者。</p>
            </div>
            
            <div class="info-box">
                <h3>🔗 相关链接</h3>
                <ul>
                    <li>API 文档：<a href="https://api.example.com/api.php" target="_blank">https://api.example.com/api.php</a></li>
                    <li>GD音乐台：<a href="https://music.example.com/" target="_blank">https://music.example.com/</a></li>
                    <li>XCloud音乐：<a href="https://example.com/" target="_blank">https://example.com/</a></li>
                </ul>
            </div>
        </div>
    </div>
    
    <script>
        function copyCode(button, codeId) {
            const codeElement = document.getElementById(codeId);
            let text = codeElement.textContent;
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = text;
            text = tempDiv.textContent || tempDiv.innerText || text;
            
            navigator.clipboard.writeText(text).then(() => {
                const originalText = button.textContent;
                button.textContent = '已复制!';
                button.style.background = '#28a745';
                
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '#667eea';
                }, 2000);
            }).catch(err => {
                console.error('复制失败:', err);
                button.textContent = '复制失败';
                button.style.background = '#dc3545';
            });
        }
    </script>
</body>
</html>

