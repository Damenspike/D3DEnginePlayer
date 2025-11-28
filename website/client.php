<?php
	// --- Required Files & Setup ---
	require_once("__db.php");
	require_once("includes/Mobile_Detect.php");
	require_once("api/v1/version.php");

	date_default_timezone_set('EST');

	$GLOBALS["BASE_URL"] = "/";
	$GLOBALS["CAPTCHA_KEY"] = "";
	$GLOBALS["MYSQL"] = null;
	$GLOBALS["CLIENT"] = null;
	$GLOBALS["IS_MOB"] = IsMobile();
	
	function connect_db() {
		global $MYSQL;
		
		$MYSQL = new MySQLIExtension();
		$MYSQL->query("set names 'utf8mb4'");
	}

	function draw_error() {
		global $ERROR;
		?>
			<div class='error'>
				<?=$ERROR?>
			</div>
		<?php
	}

	function redirect($url, $secs = 0) {
		echo "<meta http-equiv=\"Refresh\" content=\"$secs; url='$url'\">";
		echo "<script>redirect('$url', $secs);</script>";
	}

	function IsMobile() {
		$detect = new Mobile_Detect;
		return $detect->isMobile() || $detect->isTablet();
	}

	function html($text, $r = true) {
		if($r) {
			return htmlentities($text);
		}
		echo htmlentities($text);
	}

	function quote($text, $r = true) {
		$text = str_ireplace("'", "&rsquo;", $text);
		$text = str_ireplace("\"", "&rdquo;", $text);
		if($r) {
			return htmlentities($text);
		}
		echo addslashes($text);
	}

	function generateRandomString($length = 10) {
		$characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
		$randomString = '';
		for ($i = 0; $i < $length; $i++) {
			$randomString .= $characters[rand(0, strlen($characters) - 1)];
		}
		return $randomString;
	}

	function getUser($id) {
		global $MYSQL;
		global $USERS_CACHED;
		
		if($USERS_CACHED[$id]) {
			return $USERS_CACHED[$id];
		}
		
		$user = $MYSQL->getrowq("SELECT * FROM users WHERE `id` = '?'", array($id));
		
		if(!$user)
			return null;
		
		$user = finishUser($user);
		
		$USERS_CACHED[$id] = $user;
		
		return $user;
	}

	function finishUser($user) {
		global $MYSQL;
		
		unset($user["password"]);
		unset($user["auth"]);
		
		return $user;
	}

	function finishUsers($users) {
		foreach($users as $k => $user) {
			$users[$k] = finishUser($user);
		}
		return $users;
	}

	function image_url($url) {
		return $url;
	}

	function timestr($time, $hours = false, $giveFuture = false) {
		if (!$time) {
			return "Never";
		}
	
		// Current epoch time is always UTC-based,
		// so using time() is fine. The difference
		// is in how we format it (gmdate() vs date()).
		$now = time();
		$diff = $now - $time;
	
		// If we should display a future date/time or it's actually in the future:
		if ($giveFuture || $diff < 0) {
			$format = $hours ? "jS F Y, h:i A" : "jS F Y";
			return gmdate($format, $time);  // UTC output
		}
	
		if ($diff < 60) {
			return "Just now";
		}
		if ($diff < 3600) { // less than an hour
			return floor($diff / 60) . "m";
		}
		if ($diff < 86400) { // less than a day
			return floor($diff / 3600) . "h";
		}
		if ($diff < 604800) { // less than a week
			return floor($diff / 86400) . "d";
		}
		if ($diff < 2592000) { // less than a month
			return floor($diff / 604800) . "w";
		}
		if ($diff < 31536000) { // less than a year
			if ($hours) {
				return gmdate("j M, h:i A", $time);  // UTC output
			}
			return gmdate("j M", $time);            // UTC output
		}
	
		// Over a year
		return gmdate("j M Y", $time);  // UTC output
	}

	function timeAgoOrFullDate($seconds, $concat = false) {
		$now = time();
		$timeDifference = $now - $seconds;
	
		// If the difference is greater than 7 days, return the full date
		if ($timeDifference > 7 * 24 * 60 * 60) {
			return date('jS M Y', $seconds); // Format can be adjusted as needed
		}
	
		// Calculate time ago
		$timeUnits = array(
			60 * 60 * 24 => $concat ? 'd' : 'day',
			60 * 60 => $concat ? 'h' : 'hour',
			60 => $concat ? 'm' : 'minute',
			1 => $concat ? 's' : 'second',
		);
	
		foreach ($timeUnits as $unitSeconds => $unitName) {
			if ($timeDifference >= $unitSeconds) {
				$unitCount = floor($timeDifference / $unitSeconds);
				return $unitCount . ($concat ? '' : ' ') . $unitName . (!$concat && $unitCount > 1 ? 's' : '') . ' ago';
			}
		}
	
		// Default to "just now" if no significant difference
		return 'just now';
	}

	function timestrlegacy($seconds) {
		$minutes = floor($seconds / 60);
		$hours = floor($seconds / 3600);
		$days = floor($hours / 24);
		$time = $seconds . "s";
		$secs = $seconds % 60;
		$mins = $minutes % 60;
		$h = $hours % 24;
		$time = number_format($seconds) . "s";
		if($seconds > 60) {
			$time = $minutes . "m " . ($secs) . "s";
		}
		if($hours > 0) {
			$time = $hours . "h " . $mins . "m " . ($secs) . "s";
		}
		if($days > 0) {
			$time = $days . "d " . $h . "h " . $mins . "m " . ($secs) . "s";
		}
		return $time;
	}
	
	function getHashedTimeStringSmall($time, $withMs = false) {
		$time = (float) $time;
		$negative = $time < 0;
		$absTime  = abs($time);
	
		// Breakdown hours / minutes / seconds
		$hours = (int) floor($absTime / 3600);
		$mins  = (int) floor($absTime / 60) % 60;
		$secs  = (int) floor($absTime) % 60;
	
		// Hundredths of a second
		$hundredths = 0;
		if ($withMs) {
			$fraction   = $absTime - floor($absTime);
			$hundredths = (int) floor($fraction * 100);
		}
	
		// Build the string
		if ($absTime < 60) {
			// Seconds only
			if ($withMs) {
				$result = sprintf('%d"%02d', $secs, $hundredths);
			} else {
				$result = sprintf('%d"', $secs);
			}
		} elseif ($absTime < 3600) {
			// Minutes and seconds
			if ($withMs) {
				$result = sprintf('%d\'%02d"%02d', $mins, $secs, $hundredths);
			} else {
				$result = sprintf('%d\'%02d"', $mins, $secs);
			}
		} else {
			// Hours, minutes, and seconds
			if ($withMs) {
				$result = sprintf('%dh%02d\'%02d"%02d', $hours, $mins, $secs, $hundredths);
			} else {
				$result = sprintf('%dh%02d\'%02d"', $hours, $mins, $secs);
			}
		}
	
		return $negative ? '-' . $result : $result;
	}
	
	function authenticate($authKey, $udid, $returnUser) {
		global $MYSQL;
		$row = $MYSQL->getrowq("SELECT * FROM authentications WHERE `key` = '?' AND `udid` = '?'", array($authKey, $udid));
		if(!$row) {
			return;
		}
		if($returnUser) {
			return $MYSQL->getrowq("SELECT * FROM users WHERE `id` = '?'", array($row["user"]));
		}
		return $row;
	}
	
	function getFileSha1($filePath) {
		if (!is_readable($filePath)) {
			return false;
		}
		return sha1_file($filePath);
	}
	
	function hashDirectory($directory){
		if (! is_dir($directory)){
			return false;
		}
		$files = array();
		$dir = dir($directory);
		while (false !== ($file = $dir->read())){
			if ($file != '.' and $file != '..') {
				if (is_dir($directory . '/' . $file)) {
					$files[] = hashDirectory($directory . '/' . $file);
				} else {
					$files[] = md5_file($directory . '/' . $file);
				}
			}
		}
		$dir->close();
		return md5(implode('', $files));
	}
	
	function valid_file_name($file) {
		$file = str_replace("-", "", $file);
		$file = str_replace("_", "", $file);
		return ctype_alnum($file);
	}
	
	function verifyUtcTimestamp(string $clientUtcTimeString, int $acceptableThreshold = 5): bool {
		try {
			$clientTime = new DateTime($clientUtcTimeString, new DateTimeZone('UTC'));
		} catch (Exception $e) {
			return false;
		}
		$serverTime = new DateTime('now', new DateTimeZone('UTC'));
		$timeDifference = abs($serverTime->getTimestamp() - $clientTime->getTimestamp());
		return $timeDifference <= $acceptableThreshold;
	}
	
	function iso8601FromTimestamp(int $timestamp, bool $useUtc = true): string
	{
		// Create a DateTime in UTC based on the timestamp
		$dt = new DateTime('@' . $timestamp);
		if ($useUtc) {
			$dt->setTimezone(new DateTimeZone('UTC'));
			// Format as "YYYY-MM-DDTHH:MM:SSZ"
			return $dt->format('Y-m-d\TH:i:s\Z');
		} else {
			// Use server default timezone, format like "YYYY-MM-DDTHH:MM:SS+02:00"
			return $dt->setTimezone(new DateTimeZone(date_default_timezone_get()))
					  ->format(DateTime::ATOM);
		}
	}
	
	function toSqlDateTimeLiteral($value, $timezone = 'UTC'): string
	{
		// Step 1: Obtain a DateTime instance
		if ($value instanceof DateTime) {
			$dt = clone $value;
		}
		elseif (is_int($value)) {
			// Unix timestamp
			$dt = new DateTime('@' . $value);
			// '@' forces UTC
		}
		elseif (is_string($value)) {
			// Try ISO-8601 first
			// DateTime will auto-detect "T" and timezone offset if present.
			// For pure "YYYY-MM-DD HH:MM:SS" it also works.
			$dt = new DateTime($value);
		}
		else {
			throw new InvalidArgumentException('Unsupported date input: ' . gettype($value));
		}
	
		// Step 2: Ensure it has a timezone
		if (!$dt->getTimezone() || $dt->getTimezone()->getName() === '+00:00') {
			// If the parsed string had a 'Z' or offset, it's fine.
			// If not, explicitly set fallback.
			$tz = $timezone instanceof DateTimeZone
				? $timezone
				: new DateTimeZone($timezone);
			$dt->setTimezone($tz);
		}
	
		// Step 3: Format into SQL DATETIME (no timezone part)
		//    YYYY-MM-DD HH:MM:SS
		$sqlDatetime = $dt->format('Y-m-d H:i:s');
	
		// Step 4: Wrap in single quotes for literal use
		return $sqlDatetime;
	}
	
	function bcrypt($str) {
		$options = [
			'cost' => 12,
		];
		return password_hash($str, PASSWORD_BCRYPT, $options);
	}
	function addOrdinal($number) {
		$abs = abs($number);
		$suffix = 'th';
		
		// Special cases: 11, 12, 13 all use 'th'
		if (($abs % 100) < 11 || ($abs % 100) > 13) {
			switch ($abs % 10) {
				case 1:
					$suffix = 'st';
					break;
				case 2:
					$suffix = 'nd';
					break;
				case 3:
					$suffix = 'rd';
					break;
			}
		}
	
		return $number . $suffix;
	}
	function getCountryByIp(string $ip = null) {
		$url  = 'http://www.geoplugin.net/json.gp?ip=' . urlencode($ip);
		$resp = @file_get_contents($url);
		
		if ($resp !== false) {
			$data = @json_decode($resp);
			if (!empty($data->geoplugin_countryCode)) {
				return $data->geoplugin_countryCode;
			}
		}
		
		return 'BE';
	}
	function truncate_number_to_string(float $value, int $precision = 2): string
	{
		if ($precision < 0) {
			// no negative precision
			$precision = 0;
		}
	
		$factor = pow(10, $precision);
	
		if ($value >= 0) {
			$truncated = floor($value * $factor) / $factor;
		} else {
			// for negatives, floor() would go “more negative” so use ceil()
			$truncated = ceil($value * $factor) / $factor;
		}
	
		// now format with exactly $precision decimals
		return number_format($truncated, $precision, '.', '');
	}
?>