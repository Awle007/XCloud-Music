<?php
declare(strict_types=1);

function xcloudNeteaseDecodePayload(string $response): mixed
{
    $text = trim($response);
    for ($depth = 0; $depth < 4; $depth++) {
        $decoded = xcloudNeteaseJsonDecode($text);
        if ($decoded !== null) return $decoded;

        $next = str_ireplace(['%0A', '%0D', '%09'], ['\\n', '\\r', '\\t'], $text);
        $next = rawurldecode($next);
        $next = preg_replace_callback('/%u([0-9a-fA-F]{4})/', static function (array $match): string {
            return html_entity_decode('&#x' . $match[1] . ';', ENT_NOQUOTES, 'UTF-8');
        }, $next) ?? $next;
        if ($next === $text) break;
        $text = $next;
    }
    return null;
}

function xcloudNeteaseJsonDecode(string $json): mixed
{
    $decoded = json_decode($json, true, 512, JSON_INVALID_UTF8_SUBSTITUTE);
    if (json_last_error() === JSON_ERROR_NONE) return $decoded;

    $sanitized = xcloudNeteaseEscapeBareStringQuotes($json);
    if ($sanitized === $json) return null;
    $decoded = json_decode($sanitized, true, 512, JSON_INVALID_UTF8_SUBSTITUTE);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : null;
}

function xcloudNeteaseEscapeBareStringQuotes(string $json): string
{
    $length = strlen($json);
    $result = '';
    $inString = false;

    for ($index = 0; $index < $length; $index++) {
        $char = $json[$index];
        if (!$inString) {
            if ($char === '"') $inString = true;
            $result .= $char;
            continue;
        }

        if ($char === '\\') {
            $result .= $char;
            if ($index + 1 < $length) $result .= $json[++$index];
            continue;
        }
        if ($char !== '"') {
            $result .= $char;
            continue;
        }

        $next = $index + 1;
        while ($next < $length && ctype_space($json[$next])) $next++;
        if (xcloudNeteaseIsStringTerminator($json, $next, $length)) {
            $inString = false;
            $result .= $char;
            continue;
        }
        $result .= '\\"';
    }
    return $result;
}

function xcloudNeteaseIsStringTerminator(string $json, int $next, int $length): bool
{
    if ($next >= $length) return true;
    if (str_contains(':,}', $json[$next])) return true;
    if ($json[$next] !== ']') return false;

    // A source value can contain text such as ["Our Skyy 2"]. The inner
    // closing quote is followed by ], then by the actual JSON string quote.
    $afterBracket = $next + 1;
    while ($afterBracket < $length && ctype_space($json[$afterBracket])) $afterBracket++;
    return $afterBracket >= $length || $json[$afterBracket] !== '"';
}
