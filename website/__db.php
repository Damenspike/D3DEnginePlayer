<?php
	class MySQLIExtension {
		private $mysqli;
		public $debugQueries = array();
		function __construct($db = "veloproracer") {
			$h = "localhost";
			$u = "vpr";
			$p = 'NDc-KuPG.NwTX(_Bz+V`A9Q(H%-w{).5L,cft!';
			$d = $db;
			$this->mysqli = new mysqli($h, $u, $p, $d);
			if(mysqli_connect_errno()) {
				die("Error in database.".mysqli_connect_errno());
			}else{
				$this->mysqli->set_charset("utf8mb4");
			}
		}
		function query($q, $params = array(), $debug = false) {
			if(count($params) > 0) {
				$parts = explode("?", $q);
				$rebuild = "";
				foreach($parts as $k => $part) {
					$rebuild .= $part . $this->escape($params[$k]);
				}
			}else{
				$rebuild = $q;
			}
			if($debug) {
				var_dump($rebuild);
				return;
			}
			/*$startTime = $this->miltime();
			$q = $this->mysqli->query($rebuild);
			$totalTime = $this->miltime() - $startTime;
			if($_GET["debugTimes"]) {
				echo "Total: " . $totalTime . "s, Query: " . $rebuild . "<br />";
				array_push($this->debugQueries, array("time" => $totalTime, "query" => $rebuild));
			}*/
			return $this->mysqli->query($rebuild);
		}
		function miltime() {
			return (microtime(true) * 1000);
		}
		function assoc($q) {
			if(!$q){
				return false;
			}
			return $q->fetch_assoc();
		}
		function num_rows($q) {
			if(!$q){
				return false;
			}
			return $q->num_rows;
		}
		function numrowsq($query, $a = []) {
			return $this->num_rows($this->query($query, $a));
		}
		function getrowq($query, $a = []) {
			return $this->assoc($this->query($query, $a));
		}
		function getrowsq($query, $a = []) {
			$res = array();
			$q = $this->query($query, $a);
			
			while($as = $this->assoc($q)) {
				$res[] = $as;
			}
			return $res;
		}
		function escape($str) {
			return $this->mysqli->real_escape_string($str);
		}
		function error() {
			return $this->mysqli->error;
		}
		function lastInsertId() {
			return $this->mysqli->insert_id;
		}
		function getrows($q) {
			if(!$q){
				return false;
			}
			$rows = array();
			while($as = $this->assoc($q)) {
				$rows[] = $as;
			}
			return $rows;
		}
	}
?>