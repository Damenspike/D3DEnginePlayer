<style>
	body {
		font-family: "proxima-nova", sans-serif;
		margin: 0px;
		height: 100%;
		
		background: #282828;
		color: white;
	}
	
	p, li {
		line-height: 22px;
	}
	
	h1, h2, h3 {
		font-optical-sizing: auto;
		font-style: normal;
	}
	
	@font-face {
		font-family: 'Material Icons';
		font-style: normal;
		font-weight: 400;
		src: url(/assets/fonts/MaterialIcons-Regular.eot); /* For IE6-8 */
		src: local('Material Icons'),
		local('MaterialIcons-Regular'),
		url(/assets/fonts/MaterialIcons-Regular.woff2) format('woff2'),
		url(/assets/fonts/MaterialIcons-Regular.woff) format('woff'),
		url(/assets/fonts/MaterialIcons-Regular.ttf) format('truetype');
	}
	
	.op-content .header {
		display: none !important;
	}
	.op-content footer {
		display: none !important;
	}
	.op-content .fbar {
		display: none !important;
	}
	.op-content .content-container {
		padding: 0px !important;
	}
	.op-content--event {
		max-width: 1200px;
	}
	.mi {
		font-family: 'Material Icons';
		font-weight: normal;
		font-style: normal;
		font-size: 24px;  /* Preferred icon size */
		display: inline-block;
		vertical-align: middle;
		line-height: 1;
		text-transform: none;
		letter-spacing: normal;
		word-wrap: normal;
		white-space: nowrap;
		direction: ltr;
		padding-right: 3px;
		
		/* Support for all WebKit browsers. */
		-webkit-font-smoothing: antialiased;
		/* Support for Safari and Chrome. */
		text-rendering: optimizeLegibility;
		
		/* Support for Firefox. */
		-moz-osx-font-smoothing: grayscale;
		
		/* Support for IE. */
		font-feature-settings: 'liga';
	}
	.material-icons {
		vertical-align: middle;
	}
	
	.header {
		background: rgb(26, 26, 26);
		position: relative;
		width: 100%;
		height: 150px;
		text-align: left;
		border-bottom: 1px solid rgba(255, 255, 255, 0.176);
		
		.logo {
			position: absolute;
			top: 50%;
			left: 40px; 
			transform: translateY(-50%);
		}
	}
	.header--index, .header--racepass {
		margin-bottom: 0px;
		border-bottom: none;
		
		.logo img {
			width: 150px !important;
		}
	}
	.menu-bar {
		position: absolute;
		top: 50%;
		right: 40px; 
		transform: translateY(-50%);
		
		i {
			font-size: 28px;
		}
	}
	.menu-bar-link {
		display: inline-block;
		vertical-align: middle;
		margin-right: 40px;
		
		color: white !important;
		font-weight: 1000;
	}
	.menu-bar-link--mb-only {
		display: none;
	}
	.content-container {
		margin-top: 50px;
		min-height: 300px;
	}
	.content-container--index {
		margin-top: 0px;
	}
	.content {
		padding: 40px;
	}
	.reading {
		max-width: 1000px;
		margin: 10px;
		text-align: left;
	}
	.account {
		width: 100%;
		max-width: 1200px;
		text-align: left;
		
		.account__sidebar {
			flex: 1;
			max-width: 250px;
			margin-right: 20px;
			min-height: 400px;
			
			border-right: 2px solid rgba(0, 0, 0, 0.265);
			
			i {
				vertical-align: middle;
				padding-right: 10px;
			}
		}
		.account__body {
			flex: 1;
			padding-left: 30px;
		}
		.account__module {
			a {
				color: black;
			}
			height: 40px;
		}
		.account__module--current {
			font-weight: bold;
		}
	}
	.mob-content {
		.account-container {
			display: block;
			flex: none;
			padding: 20px;
		}
		.account__sidebar {
			width: 100%;
			border: none;
			margin: 0px;
			max-width: none;
			min-height: 0px;
		}
		.account__module {
			display: inline-block;
			vertical-align: middle;
			margin: 10px;
		}
	}
	.account-container {
		display: flex;
		flex-direction: row;
		padding: 50px;
	}
	.logo {
		padding-left: 20px;
		padding-top: 20px;
		padding-bottom: 20px;
	}
	.logo img {
		width: 120px;
		vertical-align: middle;
		margin-right: 20px;
	}
	.bubble {
		border: 1px solid rgb(169, 169, 169);
		padding: 20px;
	}
	.code {
		padding: 20px;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.3);
		font-family: monospace;
	}
	.bluebox {
		border-color: blue;
	}
	.mt {
		margin-top: 10px;
	}
	.mt2 {
		margin-top: 20px;
	}
	.mt4 {
		margin-top: 40px;
	}
	.mb {
		margin-bottom: 10px;
	}
	.mb2 {
		margin-bottom: 20px;
	}
	.mr {
		margin-right: 10px;
	}
	.mr2 {
		margin-right: 20px;
	}
	.badge-cont {
		padding: 20px;
		border-radius: 10px;
		cursor: pointer;
		width: 150px;
	}
	.badge-cont:hover {
		background: rgba(0, 0, 0, 0.27);
	}
	
	.no-select {
		user-drag: none;
		-webkit-user-drag: none;
		user-select: none;
		-moz-user-select: none;
		-webkit-user-select: none;
		-ms-user-select: none;
	}
	.bl {
		font-weight: normal;
		border:none;
		outline:none;
		background:none;
		cursor:pointer;
		padding:0;
		font-family:inherit;
		font-size:inherit;
		border-bottom: 1px solid rgba(0, 0, 0, 0);
		padding-bottom: 5px;
		border-radius: 0px;
	}
	.rp {
		margin-right: 10px;
	}
	.rp2 {
		margin-right: 20px;
	}
	.med {
		font-size: 15px;
	}
	.small {
		font-size: 14px;
	}
	.smaller {
		font-size: 13px;
	}
	.gray {
		color: gray !important;
	}
	.label {
		max-width: 350px;
	}
	.error {
		margin-top: 10px;
		margin-bottom: 10px;
		color: rgb(195, 49, 49);
	}
	.tf {
		color: inherit;
		outline: none;
		background: none;
		border: none;
		font-size: inherit;
		border-bottom: 2px solid rgba(0, 0, 0, 0.14);
		font-family: inherit;
		padding: 5px;
		padding-bottom: 10px;
		margin-bottom: 15px;
		min-width: 350px;
		border-radius: 0px;
	}
	.tf:focus {
		padding-bottom: 10px;
		border-bottom: 2px solid #000000;
	}
	.numbertf {
		min-width: 100px;
	}
	.checkmark {
		vertical-align: middle;
		padding-left: 2px;
		height: 18px;
		max-width: 20px;
		filter: brightness(150%);
	}
	.ib {
		display: inline-block;
		vertical-align: middle;
	}
	.vat, .vt {
		vertical-align: top;
	}
	.vm {
		vertical-align: middle;
	}
	.vb {
		vertical-align: bottom;
	}
	.partner {
		padding: 10px;
	}
	.partner img {
		height: 80px;
	}
	.menu-mb {
		z-index: 100;
		top: 0;
		width: 100%;
		height: 100%;
		display: none;
		position: relative;
		color: white;
		background: #1e1e1e;
		
		i {
			font-size: 28px;
		}
		
		.menu-bar-link {
			display: block;
			padding: 20px;
			margin-right: 0px;
			margin-bottom: 10px;
			text-align: center;
		}
		.menu-bar-link:hover {
			background: black;
			
			color: white !important;
		}
		.menu-bar-link--mb-only {
			display: block;
		}
	}
	.menu-mb__links {
		padding-top: 60px;
	}
	.menu-mb__close {
		position: absolute;
		right: 20px;
		top: 10px;
	}
	.menu-icon {
		width: 25px;
		filter: brightness(0%);
		cursor: pointer;
	}
	.clickable {
		cursor: pointer;
	}
	.op {
		display: none;
	}
	.op-close {
		float: right;
		z-index: 102;
		position: relative;
	}
	.overlay-page {
		position: fixed;
		top: 0; left: 0;
		width: 100%; height: 100%;
		background: rgba(0,0,0,0.75);
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.op-content {
		background: white;
		color: black;
		border-radius: 5px;
		padding: 20px;
		margin: 20px;
		width: 100%;
		max-width: 600px;
		max-height: calc(100vh - 100px);
		overflow-y: auto;
	}
	.icon {
		width: 20px;
	}
	.tool-icon {
		width: 15px;
		margin-right: 5px;
		vertical-align: middle;
	}
	.tool-icon--solo {
		width: 15px;
		vertical-align: middle;
	}
	.options {
		margin-top: 5px;
		margin-bottom: 10px;
	}
	.options a, .options button {
		margin-right: 10px;
	}
	.center {
		text-align: center;
	}
	.dot {
		background: #33c728;
		width: 6px;
		height: 6px;
		border-radius: 100px;
		border: 1px solid black;
	}
	.no-underline:hover {
		text-decoration: none;
	}
	.xlarge {
		font-size: 30px;
	}
	.large {
		font-size: 24px;
	}
	.banner {
		height: 680px;
		background: rgb(31, 31, 255);
		box-sizing: border-box; /* Include padding within the 350px height */
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: white;
		
		.button {
			background: white;
			color: black !important;
			
			i {
				padding-right: 5px;
			}
		}
		.button:hover {
			background: black;
			color: white !important;
		}
	}
	.banner__left {
		padding-left: 100px;
		margin-right: 60px;
		width: 400px;
	}
	.banner__right {
		flex: 1;
		overflow: hidden;    /* Prevent image from overflowing */
		height: 100%;        /* Use full height of parent */
		max-width: 800px;
		position: relative;
	}
	.banner__right img {
		width: 100%;
		display: block;     /* Remove any default inline spacing */
	}
	.banner__right--cover img {
		height: 100%;
		object-fit: cover;  /* Scale image to cover container without distortion */
	}
	.banner__season {
		position: absolute;
		bottom: 20px;
		right: 40px;
		text-align: right;
		text-shadow: 0px 0px 10px black;
		
		a {
			color: white !important;
		}
	}
	.banner--racepass {
		height: 500px;
	}
	
	button, .button {
		background: #0099ff;
		border: none;
		padding: 7px;
		min-width: 100px;
		color: rgb(255, 255, 255) !important;
		font-weight: bold;
		text-align: center;
		border-radius: 7px;
		cursor: pointer;
		display: inline-block;
		text-decoration: none !important;
		text-shadow: 0px 0px 3px rgba(0, 0, 0, 0.142);
		
		svg {
			vertical-align: middle;
			padding: 2px;
		}
	}
	button:hover, .button:hover {
		background: #0074c1;
	}
	button:active, .button:active {
		filter: brightness(50%);
	}
	button:disabled, button:disabled:active, .button:disabled, .button:disabled:active {
		background: #565656;
		opacity: 0.4;
		filter: none;
		cursor: not-allowed;
	}
	
	.offering {
		box-sizing: border-box; /* Include padding within the 350px height */
		display: flex;
		justify-content: space-between;
		align-items: center;
		
		margin-bottom: 10px;
	}
	.offering--white {
		.button {
			background: black;
			
			color: white !important;
		}
	}
	.offering--black {
		background: black;
		color: white;
		padding: 40px;
		text-align: right;
		
		.get-game-cta {
			justify-self: flex-end;
		}
		
		a {
			color: white;
		}
		a:hover {
			color: rgb(208, 208, 208);
		}
	}
	.features {
		margin-top: 50px;
		max-width: 1200px;
	}
	.feature {
		display: inline-block;
		vertical-align: top;
		padding: 40px;
		width: 250px;
		height: 200px;
		text-align: center;
		
		i {
			font-size: 40px;
		}
	}
	.center {
		text-align: center;
		justify-content: center;
		align-self: center;
	}
	.faq {
		text-align: left;
		max-width: 800px;
	}
	.mob-content {
		margin-top: 10px;
		
		.reading {
			padding: 20px;
		}
		.offering {
			display: block;
		}
		.banner {
			display: block !important;
			flex: none !important;
			position: static !important;
			height: auto;
		}
		.banner__main {
			padding: 40px !important;
		}
		.banner__left {
			padding: 10px;
			width: auto;
			margin-right: auto;
			
			img {
				max-height: 400px;
			}
		}
		.banner__right {
			height: auto;
			
			img {
				max-height: 400px;
			}
		}
	}
	.install-box {
		width: 300px;
		height: 300px;
		margin: 5px;
		align-content: center;
		align-items: center;
		
		.button {
			width: 150px;
		}
	}
	.req-table {
		width: 80%;
		max-width: 600px;
		
		th {
			font-weight: bold;
			font-family: "Helvetica Heavy";
			padding: 8px; 
			border-bottom: 2px solid #ccc;
		}
		td {
			padding: 8px;
		}
	}
	.login-form {
		
		.button {
			font-size: 18px;
		}
	}
	.select-pages {
		display: inline-block;
		width: 60px;
		min-width: 0px !important;
		margin-left: 10px;
	}
	.activity {
		position: relative;
		margin-bottom: 30px;
		padding: 20px;
		border-radius: 10px;
		border: 1px solid rgba(0, 0, 0, 0.094);
		box-shadow: 0px 10px 10px rgba(0, 0, 0, 0.2);
		
		.activity__options {
			position: absolute;
			top: 20px;
			right: 20px;
		}
		.activity__title {
			font-family: "Helvetica Heavy";
			font-size: 20px;
			font-weight: bold;
		}
		.activity__time {
			font-size: 16px;
			color: rgba(0, 0, 0, 0.757);
			
			.ib {
				min-width: 100px;
			}
		}
	}
	.activity--clickable {
		cursor: pointer;
		transition: scale linear 0.1s;
	}
	.activity--clickable:hover {
		scale: 1.05;
	}
	.result-table {
		width: 100%;
		font-size: 16px;
		
		thead {
			td {
				font-weight: bold;
			}
		}
	}
	.stat {
		width: 180px;
	}
	.attrib {
		color: gray;
		a {
			color: gray !important;
		}
	}
	
	hr {
		border: 0.1px solid rgba(255, 255, 255, 0.119);
	}
	a, a:visited, bl {
		color: white;
		text-decoration: none;
	}
	a:hover, bl:hover {
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-decoration-color: #0099ff;
		text-underline-offset: 8px;
	}
	footer {
		background: rgb(26, 26, 26);
		margin-top: 40px;
		padding-top: 20px;
		padding-bottom: 20px;
		padding-left: 80px;
		padding-right: 80px;
		font-size: 14px;
		color: white;
		height: max-content;
	}
	footer a {
		color: white !important;
	}
	footer a:hover {
		color: rgb(198, 198, 198) !important;
	}
	select {
		border: none;
		border-bottom: 2px solid #303030;
		border-radius: 0px;
		-webkit-appearance: none; 
		-moz-appearance: none;
		background: none;
		padding: 8px;
		min-width: 350px;
		outline: none;
		font-family: inherit;
		font-size: inherit;
		background: url('/assets/images/select-arrow-dark.png') no-repeat right;
		cursor: hand;
	}
	select option:not(:checked) {
		color: #000;
	}
	select option {
		color: white;
		outline: none;
	}
	select:focus {
		border-bottom: 2px solid #ffffff;
	}
	input[type=checkbox] {
		width: 15px;
		height: 15px;
	}
	form {
		.tf {
			width: 100%;
			max-width: 500px;
		}
	}
</style>