<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once 'config.php';

$action = $_POST['action'] ?? ''; // add, remove, create, delete, batch_add, update_song_info
$userId = $_POST['user_id'] ?? '';
$playlistId = $_POST['playlist_id'] ?? '';
$playlistName = $_POST['playlist_name'] ?? '';
$songId = $_POST['song_id'] ?? '';
$songTitle = $_POST['song_title'] ?? '';
$songArtist = $_POST['song_artist'] ?? '';
$songCover = $_POST['song_cover'] ?? '';
$songSource = $_POST['source'] ?? 'netease';
$songAlbum = $_POST['album'] ?? '';

if (empty($action) || empty($userId)) {
    echo json_encode(['success' => false, 'message' => '参数不完整']);
    exit;
}

try {
    $conn = getDBConnection();
    
    switch ($action) {
        case 'create':
            // 创建新播放列表 - 检查是否已存在
            $stmt = $conn->prepare("SELECT id FROM playlists WHERE user_id = ? AND name = ?");
            $stmt->execute([$userId, $playlistName]);
            if ($stmt->rowCount() > 0) {
                // 歌单已存在，返回其ID
                $playlist = $stmt->fetch(PDO::FETCH_ASSOC);
                echo json_encode([
                    'success' => true,
                    'message' => '歌单已存在',
                    'playlist' => ['id' => $playlist['id'], 'name' => $playlistName]
                ]);
            } else {
                // 创建新歌单
                $stmt = $conn->prepare("INSERT INTO playlists (user_id, name) VALUES (?, ?)");
                $stmt->execute([$userId, $playlistName]);
                $playlistId = $conn->lastInsertId();
                echo json_encode([
                    'success' => true,
                    'message' => '创建成功',
                    'playlist' => ['id' => $playlistId, 'name' => $playlistName]
                ]);
            }
            break;
            
        case 'delete':
            // 删除播放列表
            $conn->beginTransaction();
            
            // 首先删除歌单中的所有歌曲
            $stmt = $conn->prepare("DELETE FROM playlist_songs WHERE playlist_id = ?");
            $stmt->execute([$playlistId]);
            
            // 然后删除歌单
            $stmt = $conn->prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?");
            $stmt->execute([$playlistId, $userId]);
            
            $conn->commit();
            
            echo json_encode(['success' => true, 'message' => '删除成功']);
            break;
            
        case 'batch_add':
            // 批量添加歌曲到播放列表
            if (empty($playlistId)) {
                echo json_encode(['success' => false, 'message' => '参数不完整（歌单ID）']);
                exit;
            }

            // 获取批量歌曲数据
            $songs = isset($_POST['songs']) ? json_decode($_POST['songs'], true) : null;
            if (!$songs || !is_array($songs)) {
                echo json_encode(['success' => false, 'message' => '无效的歌曲数据']);
                exit;
            }

            // 批量添加歌曲
            $conn->beginTransaction();
            try {
                $successCount = 0;
                
                foreach ($songs as $song) {
                    $songId = $song['song_id'] ?? '';
                    $songTitle = $song['song_title'] ?? '';
                    $songArtist = $song['song_artist'] ?? '';
                    $songCover = $song['song_cover'] ?? '';
                    $songSource = $song['source'] ?? 'netease';
                    $songAlbum = $song['album'] ?? '';

                    if (empty($songTitle) || empty($songArtist)) {
                        continue; // 跳过无效的歌曲数据
                    }

                    // 检查歌曲是否已存在于歌单中
                    $stmt = $conn->prepare("SELECT id FROM playlist_songs WHERE playlist_id = ? AND song_title = ? AND song_artist = ? AND source = ?");
                    $stmt->execute([$playlistId, $songTitle, $songArtist, $songSource]);
                    
                    if ($stmt->rowCount() > 0) {
                        // 歌曲已存在，更新信息
                        $row = $stmt->fetch(PDO::FETCH_ASSOC);
                        $existingId = $row['id'];
                        
                        $stmt = $conn->prepare("UPDATE playlist_songs SET 
                                             song_id = ?, song_cover = ?, song_album = ?
                                             WHERE id = ?");
                        $stmt->execute([
                            $songId, $songCover, $songAlbum,
                            $existingId
                        ]);
                    } else {
                        // 插入新歌曲
                        $stmt = $conn->prepare("INSERT INTO playlist_songs 
                                               (playlist_id, song_id, source, song_title, song_artist, song_cover, song_album) 
                                               VALUES (?, ?, ?, ?, ?, ?, ?)");
                        $stmt->execute([
                            $playlistId, $songId, $songSource, $songTitle, $songArtist, $songCover, $songAlbum
                        ]);
                        $successCount++;
                    }
                }
                
                $conn->commit();
                echo json_encode([
                    'success' => true, 
                    'message' => '批量添加成功，新增' . $successCount . '首歌曲',
                    'count' => $successCount
                ]);
            } catch (Exception $e) {
                $conn->rollBack();
                echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
            }
            break;
            
        case 'update_song_info':
            // 专门处理歌曲匹配后更新信息的情况
            if (empty($playlistId)) {
                echo json_encode(['success' => false, 'message' => '参数不完整（歌单ID）']);
                exit;
            }
            
            // 获取原始标题和艺术家（这些是用于查找原有记录的关键）
            $originalTitle = isset($_POST['original_title']) ? $_POST['original_title'] : '';
            $originalArtist = isset($_POST['original_artist']) ? $_POST['original_artist'] : '';
            
            // 如果没有提供原始信息，无法更新
            if (empty($originalTitle) || empty($originalArtist)) {
                echo json_encode(['success' => false, 'message' => '缺少原始歌曲信息']);
                exit;
            }
            
            // 使用原始歌曲信息查找现有记录
            $stmt = $conn->prepare("SELECT id FROM playlist_songs WHERE playlist_id = ? AND song_title = ? AND song_artist = ? AND source = ?");
            $stmt->execute([$playlistId, $originalTitle, $originalArtist, $songSource]);
            
            if ($stmt->rowCount() > 0) {
                // 找到记录，进行更新
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                $existingId = $row['id'];
                
                // 全面更新歌曲信息，包括歌曲ID、标题、艺术家、封面和专辑
                $stmt = $conn->prepare("UPDATE playlist_songs SET 
                                      song_id = ?, song_title = ?, song_artist = ?, song_cover = ?, song_album = ?
                                      WHERE id = ?");
                $stmt->execute([
                    $songId, $songTitle, $songArtist, $songCover, $songAlbum,
                    $existingId
                ]);
                
                echo json_encode([
                    'success' => true, 
                    'message' => '歌曲信息已完全更新（从"' . $originalTitle . ' - ' . $originalArtist . '"更新为"' . $songTitle . ' - ' . $songArtist . '"）',
                    'existing_id' => $existingId
                ]);
            } else {
                // 找不到记录，记录错误
                echo json_encode([
                    'success' => false, 
                    'message' => '无法找到要更新的歌曲（' . $originalTitle . ' - ' . $originalArtist . '）'
                ]);
            }
            break;
            
        case 'add':
            // 添加歌曲到播放列表
            if (empty($playlistId)) {
                echo json_encode(['success' => false, 'message' => '参数不完整']);
                exit;
            }

            // 检查是否有批量添加的歌曲
            $songs = isset($_POST['songs']) ? json_decode($_POST['songs'], true) : null;
            if ($songs) {
                // 批量添加歌曲
                $conn->beginTransaction();
                try {
                    foreach ($songs as $song) {
                        $songId = $song['song_id'] ?? '';
                        $songTitle = $song['song_title'] ?? '';
                        $songArtist = $song['song_artist'] ?? '';
                        $songCover = $song['song_cover'] ?? '';
                        $songSource = $song['source'] ?? 'netease';
                        $songAlbum = $song['album'] ?? '';

                        // 检查歌曲是否已存在于歌单中
                        $stmt = $conn->prepare("SELECT id FROM playlist_songs WHERE playlist_id = ? AND song_id = ? AND source = ?");
                        $stmt->execute([$playlistId, $songId, $songSource]);
                        
                        if ($stmt->rowCount() > 0) {
                            // 歌曲已存在，更新信息
                            $stmt = $conn->prepare("UPDATE playlist_songs SET 
                                                  song_title = ?, song_artist = ?, song_cover = ?, song_album = ?
                                                  WHERE playlist_id = ? AND song_id = ? AND source = ?");
                            $stmt->execute([
                                $songTitle, $songArtist, $songCover, $songAlbum,
                                $playlistId, $songId, $songSource
                            ]);
                        } else {
                            // 插入新歌曲
                            $stmt = $conn->prepare("INSERT INTO playlist_songs 
                                                   (playlist_id, song_id, source, song_title, song_artist, song_cover, song_album) 
                                                   VALUES (?, ?, ?, ?, ?, ?, ?)");
                            $stmt->execute([
                                $playlistId, $songId, $songSource, $songTitle, $songArtist, $songCover, $songAlbum
                            ]);
                        }
                    }
                    $conn->commit();
                    echo json_encode(['success' => true, 'message' => '批量添加成功']);
                } catch (Exception $e) {
                    $conn->rollBack();
                    echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
                }
            } else {
                // 单个歌曲添加（保持原有逻辑）
                // 注释掉检查，允许没有ID的歌曲被添加
                // if (empty($songId)) {
                //     echo json_encode(['success' => false, 'message' => '参数不完整']);
                //     exit;
                // }
                
                // 获取原始标题和艺术家（如果有）
                $originalTitle = isset($_POST['original_title']) ? $_POST['original_title'] : '';
                $originalArtist = isset($_POST['original_artist']) ? $_POST['original_artist'] : '';
                
                // 检查歌曲是否已存在于歌单中
                $songExists = false;
                $existingId = null;
                
                // 先尝试使用ID查询
                if (!empty($songId)) {
                    $stmt = $conn->prepare("SELECT id FROM playlist_songs WHERE playlist_id = ? AND song_id = ? AND source = ?");
                    $stmt->execute([$playlistId, $songId, $songSource]);
                    if ($stmt->rowCount() > 0) {
                        $row = $stmt->fetch(PDO::FETCH_ASSOC);
                        $existingId = $row['id'];
                        $songExists = true;
                    }
                }
                
                // 如果ID查询没有结果，使用原始标题和艺术家查询
                if (!$songExists && !empty($originalTitle) && !empty($originalArtist)) {
                    $stmt = $conn->prepare("SELECT id FROM playlist_songs WHERE playlist_id = ? AND song_title = ? AND song_artist = ? AND source = ?");
                    $stmt->execute([$playlistId, $originalTitle, $originalArtist, $songSource]);
                    if ($stmt->rowCount() > 0) {
                        $row = $stmt->fetch(PDO::FETCH_ASSOC);
                        $existingId = $row['id'];
                        $songExists = true;
                    }
                }
                
                // 如果上述查询都没有结果，使用当前歌曲名和艺术家查询
                if (!$songExists) {
                    $stmt = $conn->prepare("SELECT id FROM playlist_songs WHERE playlist_id = ? AND song_title = ? AND song_artist = ? AND source = ?");
                    $stmt->execute([$playlistId, $songTitle, $songArtist, $songSource]);
                    if ($stmt->rowCount() > 0) {
                        $row = $stmt->fetch(PDO::FETCH_ASSOC);
                        $existingId = $row['id'];
                        $songExists = true;
                    }
                }
                
                if ($songExists) {
                    // 歌曲已存在，更新信息
                    if ($originalTitle && $originalArtist) {
                        // 如果是非完全匹配，需要更新歌曲名和艺术家
                        $stmt = $conn->prepare("UPDATE playlist_songs SET 
                                             song_id = ?, song_title = ?, song_artist = ?, song_cover = ?, song_album = ?
                                             WHERE id = ?");
                        $stmt->execute([
                            $songId, $songTitle, $songArtist, $songCover, $songAlbum,
                            $existingId
                        ]);
                        echo json_encode(['success' => true, 'message' => '歌曲信息已完全更新（包括歌名和歌手）', 'existing_id' => $existingId]);
                    } else if (!empty($songId)) {
                        // 只需更新ID、封面和专辑信息
                        $stmt = $conn->prepare("UPDATE playlist_songs SET 
                                             song_id = ?, song_cover = ?, song_album = ?
                                             WHERE id = ?");
                        $stmt->execute([
                            $songId, $songCover, $songAlbum,
                            $existingId
                        ]);
                        echo json_encode(['success' => true, 'message' => '歌曲ID和信息已更新', 'existing_id' => $existingId]);
                    } else {
                        // 只更新封面和专辑
                        $stmt = $conn->prepare("UPDATE playlist_songs SET 
                                             song_cover = ?, song_album = ?
                                             WHERE id = ?");
                        $stmt->execute([
                            $songCover, $songAlbum,
                            $existingId
                        ]);
                        echo json_encode(['success' => true, 'message' => '歌曲信息已更新（仅封面和专辑）', 'existing_id' => $existingId]);
                    }
                } else {
                    // 插入新歌曲
                    $stmt = $conn->prepare("INSERT INTO playlist_songs 
                                           (playlist_id, song_id, source, song_title, song_artist, song_cover, song_album) 
                                           VALUES (?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $playlistId, $songId, $songSource, $songTitle, $songArtist, $songCover, $songAlbum
                    ]);
                    $newId = $conn->lastInsertId();
                    echo json_encode(['success' => true, 'message' => '添加成功', 'new_id' => $newId]);
                }
            }
            break;
            
        case 'remove':
            // 从播放列表移除歌曲
            if (empty($playlistId) || empty($songId)) {
                echo json_encode(['success' => false, 'message' => '参数不完整']);
                exit;
            }
            $stmt = $conn->prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ? AND source = ?");
            $stmt->execute([$playlistId, $songId, $songSource]);
            echo json_encode(['success' => true, 'message' => '移除成功']);
            break;
            
        case 'get':
            // 获取播放列表内容
            if (empty($playlistId)) {
                echo json_encode(['success' => false, 'message' => '参数不完整']);
                exit;
            }
            $stmt = $conn->prepare("SELECT song_id, source, song_title, song_artist, song_album, song_cover FROM playlist_songs WHERE playlist_id = ?");
            $stmt->execute([$playlistId]);
            $songs = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // 格式化歌曲数据
            $formattedSongs = [];
            foreach ($songs as $song) {
                $formattedSongs[] = [
                    'id' => $song['song_id'],
                    'source' => $song['source'] ?: 'netease',
                    'name' => $song['song_title'],
                    'artist' => $song['song_artist'],
                    'album' => $song['song_album'] ?: '未知专辑',
                    'pic_id' => $song['song_cover']
                ];
            }
            
            echo json_encode(['success' => true, 'songs' => $formattedSongs]);
            break;
            
        default:
            echo json_encode(['success' => false, 'message' => '无效的操作']);
    }
} catch (PDOException $e) {
    // 如果有事务正在进行，回滚它
    if (isset($conn) && $conn->inTransaction()) {
        $conn->rollBack();
    }
    echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
} 