<?php
declare(strict_types=1);

/** Heart mode only: source-aware artist normalization and compact profile building. */
function heartModeNormalizeArtist(string $artist): string {
    $artist = preg_replace('/\s+/u', ' ', trim($artist)) ?? trim($artist);
    return trim((string)(preg_replace('/^[,，&＆、\s]+|[,，&＆、\s]+$/u', '', $artist) ?? $artist));
}

function heartModeSplitArtists(string $artist): array {
    $artist = heartModeNormalizeArtist($artist);
    if ($artist === '') return [];
    $parts = preg_split('/\s*(?:,|，|&|＆|、|feat\.?|ft\.?)\s*/iu', $artist) ?: [];
    $result = [];
    foreach ($parts as $part) {
        $part = heartModeNormalizeArtist((string)$part);
        if ($part !== '' && !in_array($part, $result, true)) $result[] = $part;
    }
    return $result;
}

function heartModeArtistPreferenceKey(string $source, string $artist): string {
    return strtolower(trim($source)) . '|' . heartModeNormalizeArtist($artist);
}

function heartModeProfileSongKey(string $source, string $id): string {
    return strtolower(trim($source)) . ':' . trim($id);
}

function heartModeSongIdentity(string $title, string $artist): string {
    $normalize = static function (string $value): string {
        $value = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
        return preg_replace('/[\p{P}\p{S}\s]+/u', '', trim($value)) ?? trim($value);
    };
    $artists = heartModeSplitArtists($artist);
    sort($artists, SORT_STRING);
    return $normalize($title) . '|' . $normalize(implode('|', $artists));
}

function heartModeBuildProfile(array $rows): array {
    $profile = [
        'tags' => [],
        'songs' => [],
        'candidate_songs' => [],
        'heard_songs' => [],
        'artists' => [],
        'artist_preferences' => [],
        'artist_sources' => [],
        'priority_artists' => ['history' => [], 'library' => []],
        'priority_songs' => ['history' => [], 'library' => []],
        'built_from' => 'existing-library-data',
    ];
    $songSeen = [];
    $identitySeen = [];
    $artistBuckets = ['history' => [], 'library' => []];
    $songBuckets = ['history' => [], 'library' => []];
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        $source = strtolower(trim((string)($row['source'] ?? '')));
        $songId = trim((string)($row['song_id'] ?? ''));
        if ($source === '' || $songId === '') continue;
        $songKey = $source . ':' . $songId;
        $weight = max(1, (int)($row['weight'] ?? 1));
        $bucket = (($row['origin'] ?? '') === 'history') ? 'history' : 'library';
        $title = trim((string)($row['song_title'] ?? ''));
        $identity = $title === '' ? $songKey : heartModeSongIdentity($title, (string)($row['song_artist'] ?? ''));
        if (!isset($songSeen[$songKey]) && !isset($identitySeen[$identity])) {
            $profile['songs'][] = $songKey;
            $profile['candidate_songs'][] = [
                'id' => $songId,
                'source' => $source,
                'name' => (string)($row['song_title'] ?? ''),
                'artist' => heartModeNormalizeArtist((string)($row['song_artist'] ?? '')),
                'album' => (string)($row['song_album'] ?? ''),
                'pic_id' => heartModeNormalizeCover($source, (string)($row['song_cover'] ?? ''), $songId),
                'heard' => !empty($row['heard']),
                'origin' => (string)($row['origin'] ?? 'library'),
            ];
            $songSeen[$songKey] = true;
            $identitySeen[$identity] = true;
        }
        if (!empty($row['heard'])) $profile['heard_songs'][$songKey] = true;
        foreach (heartModeSplitArtists((string)($row['song_artist'] ?? '')) as $artist) {
            $key = heartModeArtistPreferenceKey($source, $artist);
            if (!isset($profile['artist_preferences'][$key])) {
                $profile['artist_preferences'][$key] = ['source' => $source, 'name' => $artist, 'weight' => 0];
            }
            $profile['artist_preferences'][$key]['weight'] += $weight;
            $profile['artists'][$artist] = ($profile['artists'][$artist] ?? 0) + $weight;
            $profile['artist_sources'][$artist][$source] = ($profile['artist_sources'][$artist][$source] ?? 0) + $weight;
            if (!isset($artistBuckets[$bucket][$artist])) {
                $artistBuckets[$bucket][$artist] = ['name' => $artist, 'weight' => 0, 'source_weights' => []];
            }
            $artistBuckets[$bucket][$artist]['weight'] += $weight;
            $artistBuckets[$bucket][$artist]['source_weights'][$source] = ($artistBuckets[$bucket][$artist]['source_weights'][$source] ?? 0) + $weight;
        }
        if (!isset($songBuckets[$bucket][$songKey])) {
            $songBuckets[$bucket][$songKey] = [
                'id' => $songId,
                'source' => $source,
                'name' => $title,
                'artist' => heartModeNormalizeArtist((string)($row['song_artist'] ?? '')),
                'album' => (string)($row['song_album'] ?? ''),
                'rank_value' => 0,
            ];
        }
        $songBuckets[$bucket][$songKey]['rank_value'] += $weight;
    }
    foreach ($profile['artist_sources'] as &$sources) {
        arsort($sources, SORT_NUMERIC);
    }
    unset($sources);
    uasort($profile['artist_preferences'], static function (array $left, array $right): int {
        return $right['weight'] <=> $left['weight'];
    });
    arsort($profile['artists'], SORT_NUMERIC);
    foreach (['history', 'library'] as $bucket) {
        uasort($artistBuckets[$bucket], static fn(array $left, array $right): int => $right['weight'] <=> $left['weight']);
        foreach ($artistBuckets[$bucket] as $artistData) {
            arsort($artistData['source_weights'], SORT_NUMERIC);
            $artistData['source'] = (string)array_key_first($artistData['source_weights']);
            $profile['priority_artists'][$bucket][] = $artistData;
        }
        uasort($songBuckets[$bucket], static fn(array $left, array $right): int => $right['rank_value'] <=> $left['rank_value']);
        $profile['priority_songs'][$bucket] = array_values($songBuckets[$bucket]);
    }
    return $profile;
}

function heartModeProfilePreferenceWeight(array $profile, string $source, string $artist): int {
    $weight = 0;
    foreach (heartModeSplitArtists($artist) as $part) {
        $key = heartModeArtistPreferenceKey($source, $part);
        $weight += (int)($profile['artist_preferences'][$key]['weight'] ?? 0);
    }
    return $weight;
}

function heartModeNormalizeCover(string $source, string $cover, string $songId): string {
    $source = strtolower(trim($source));
    $cover = trim($cover);
    if ($cover !== '' && preg_match('/^https?:\/\//i', $cover)) {
        if ($source === 'kuwo' && str_starts_with(strtolower($cover), 'http://')) return 'https://' . substr($cover, 7);
        return $cover;
    }
    if ($source === 'kuwo' && $cover !== '') return 'https://img1.kuwo.cn/star/albumcover/' . ltrim($cover, '/');
    if ($source === 'netease' && $cover !== '') return $cover;
    return '';
}

function heartModeMergeProfileCandidates(array $profile, array $songs): array {
    $seen = [];
    $identities = [];
    foreach ($profile['candidate_songs'] ?? [] as $index => $candidate) {
        if (!is_array($candidate)) continue;
        $seen[heartModeProfileSongKey((string)($candidate['source'] ?? ''), (string)($candidate['id'] ?? ''))] = true;
        $identities[heartModeSongIdentity((string)($candidate['name'] ?? ''), (string)($candidate['artist'] ?? ''))] = $index;
    }
    foreach ($songs as $song) {
        if (!is_array($song)) continue;
        $source = strtolower(trim((string)($song['source'] ?? '')));
        $id = trim((string)($song['id'] ?? $song['song_id'] ?? ''));
        if ($source === '' || $id === '') continue;
        $key = heartModeProfileSongKey($source, $id);
        if (isset($seen[$key])) continue;
        $artist = heartModeNormalizeArtist((string)($song['artist'] ?? $song['song_artist'] ?? ''));
        $identity = heartModeSongIdentity((string)($song['name'] ?? $song['title'] ?? $song['song_title'] ?? ''), $artist);
        $cover = heartModeNormalizeCover($source, (string)($song['pic_id'] ?? $song['cover'] ?? $song['song_cover'] ?? ''), $id);
        if ($cover === '') continue;
        if (isset($identities[$identity])) {
            $existingIndex = $identities[$identity];
            if (empty($profile['candidate_songs'][$existingIndex]['pic_id'])) $profile['candidate_songs'][$existingIndex]['pic_id'] = $cover;
            continue;
        }
        $profile['candidate_songs'][] = [
            'id' => $id,
            'source' => $source,
            'name' => (string)($song['name'] ?? $song['title'] ?? $song['song_title'] ?? ''),
            'artist' => $artist,
            'album' => (string)($song['album'] ?? $song['song_album'] ?? ''),
            'pic_id' => $cover,
            'heard' => !empty($profile['heard_songs'][$key]),
            'origin' => 'source_search',
        ];
        $seen[$key] = true;
        $identities[$identity] = true;
    }
    return $profile;
}

function heartModeSelectCandidates(array $candidates, int $limit = 10): array {
    $limit = max(1, $limit);
    usort($candidates, static fn(array $left, array $right): int => ($right['score'] ?? 0) <=> ($left['score'] ?? 0));
    $selected = [];
    $selectedKeys = [];
    $artistCounts = [];
    $append = static function (array $candidate, bool $enforceCap, bool $avoidAdjacent) use (&$selected, &$selectedKeys, &$artistCounts, $limit): bool {
        if (count($selected) >= $limit) return false;
        $key = (string)($candidate['key'] ?? '');
        if ($key === '' || isset($selectedKeys[$key])) return false;
        $artist = heartModeNormalizeArtist((string)($candidate['artist'] ?? ''));
        $artists = heartModeSplitArtists($artist);
        if ($enforceCap && array_filter($artists, static fn(string $item): bool => ($artistCounts[$item] ?? 0) >= 3)) return false;
        if ($avoidAdjacent && $artists && $selected) {
            $previousArtists = heartModeSplitArtists((string)end($selected)['artist']);
            if (array_intersect($artists, $previousArtists)) return false;
        }
        $candidate['artist'] = $artist;
        $selected[] = $candidate;
        $selectedKeys[$key] = true;
        foreach ($artists as $item) $artistCounts[$item] = ($artistCounts[$item] ?? 0) + 1;
        return true;
    };
    $priorityGroups = [
        static fn(array $candidate): bool => empty($candidate['heard']) && ($candidate['origin'] ?? '') === 'source_search',
        static fn(array $candidate): bool => !empty($candidate['heard']),
        static fn(array $candidate): bool => empty($candidate['heard']) && ($candidate['origin'] ?? '') !== 'source_search',
    ];
    foreach ($priorityGroups as $matches) {
        foreach ($candidates as $candidate) {
            if (!$matches($candidate)) continue;
            $append($candidate, true, true);
            if (count($selected) >= $limit) break 2;
        }
    }
    foreach ($candidates as $candidate) $append($candidate, true, true);
    foreach ($candidates as $candidate) $append($candidate, false, false);
    return $selected;
}
