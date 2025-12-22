<?php
	$PLAYER_VERSION = "1.2.3-beta.5";
	$EDITOR_VERSION = "1.2.3-beta.5";
	
	function version_to_number(string $version): float {
		// Split by '-' (prerelease)
		$parts = explode('-', $version);
		$main = $parts[0];
		$pre  = $parts[1] ?? null;
	
		// Parse major.minor.patch
		list($major, $minor, $patch) = array_map('intval', explode('.', $main));
	
		// Start with main version numeric base
		// Example: 1.2.3 → 1*1e6 + 2*1e3 + 3 = 1002003
		$number = $major * 1_000_000 + $minor * 1_000 + $patch;
	
		// No prerelease → highest rank of this version
		if (!$pre) {
			return $number + 0.999; // stable versions outrank pre
		}
	
		// Parse prerelease parts: e.g. beta.18
		if (preg_match('/^([a-zA-Z]+)\.(\d+)$/', $pre, $m)) {
			$tag = strtolower($m[1]);
			$tagNum = intval($m[2]);
		} else {
			// If prerelease has no numeric part
			$tag = strtolower($pre);
			$tagNum = 0;
		}
	
		// Ordering for prerelease tags
		$tagOrder = [
			'alpha' => 1,
			'a'     => 1,
			'beta'  => 2,
			'b'     => 2,
			'rc'    => 3,
			'pre'   => 3,
		];
	
		$order = $tagOrder[$tag] ?? 0; // unknown → lowest
	
		// Add prerelease info as fractional component
		// rc.5 > beta.20 > beta.10 > alpha.100
		return $number + ($order * 0.001) + ($tagNum * 0.000001);
	}
?>