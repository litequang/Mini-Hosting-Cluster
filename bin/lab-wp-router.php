<?php
// TEST 0.3.6 -- only for disposable localhost WordPress HTTP smoke.
// Not a security sandbox. Recovered PHP code executes as the Termux user.
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($uri) || strlen($uri) > 2048) {
    http_response_code(400);
    exit;
}
$decoded = rawurldecode($uri);
$segments = explode('/', trim($decoded, '/'));
foreach ($segments as $seg) {
    if ($seg === '..' || str_starts_with($seg, '.') || str_contains($seg, '\\') || str_contains($seg, "\0")) {
        http_response_code(403);
        exit;
    }
}
if (preg_match('#^/wp-content/uploads/.*\.php$#i', $decoded)) {
    http_response_code(403);
    exit;
}
if (preg_match('/\.(?:env|ini|cnf|sql|gz|zip|tar|bak|old|log|key|sh|pem)$/i', $decoded)
    || preg_match('#/(?:wp-config\.php|wp-config-sample\.php|\.user\.ini)$#i', $decoded)) {
    http_response_code(403);
    exit;
}
$doc = $_SERVER['DOCUMENT_ROOT'];
$file = realpath($doc . '/' . ltrim($decoded, '/'));
$root = realpath($doc);
if (is_string($file) && is_string($root) && str_starts_with($file, $root . DIRECTORY_SEPARATOR) && is_file($file)) {
    return false; // PHP built-in server handles permitted static/PHP resources.
}
// Permalinks route to WordPress frontend, no arbitrary file serving.
require $doc . '/index.php';
