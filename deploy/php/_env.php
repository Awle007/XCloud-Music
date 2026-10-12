<?php
declare(strict_types=1);
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) { http_response_code(404); exit; }

function xcloudEnv(string $name, ?string $default = null): string
{
    static $fileValues = null;
    if ($fileValues === null) {
        $envFile = dirname(__DIR__) . '/.env';
        $fileValues = is_file($envFile) ? (parse_ini_file($envFile, false, INI_SCANNER_RAW) ?: []) : [];
    }
    $value = getenv($name);
    if ($value === false || trim((string)$value) === '') $value = $fileValues[$name] ?? '';
    if (trim((string)$value) !== '') return trim((string)$value);
    if ($default !== null) return $default;
    throw new RuntimeException('Missing required server environment variable: ' . $name);
}
