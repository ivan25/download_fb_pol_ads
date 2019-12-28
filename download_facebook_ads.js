const puppeteer = require('puppeteer');
const chalk = require('chalk');
const fs = require('fs');

// Se chalk non e' installato, modificare queste righe in console.log(message)
let debugMessage0 = (message) => console.log(chalk.white.bgBlue(message));
let debugMessage1 = (message) => console.log(chalk.cyan(message));
let debugMessage2 = (message) => console.log(chalk.magenta(message));
let debugMessage3 = (message) => console.log(chalk.white.bgBlack(message));
let errorMessage = (message) => console.log(chalk.white.bgRed.bold(message));

let randomInt = (hi, lo) => Math.floor(Math.random() * (hi - lo)) + lo;

function isReqData(req, query) {
	// Funzione che determina se un certo url di richiesta (req) e' la richiesta che mi
	// interessa e che devo modificare
	// Esempio 
	// https://www.facebook.com/ads/library/async/search_ads/?
	// 	q=e&session_id=f2371099-6n22-4776-6gb2-632w3q541705&count=30&active_status=all
	// 	&ad_type=political_and_issue_ads&countries[0]=IT&impression_search_field=has_impressions_lifetime

	if (
		req.startsWith('https://www.facebook.com/ads/library/async/search_ads/') &&
		req.indexOf('q=' + query) > -1 &&
		//req.indexOf('&session_id=') > -1 &&
		req.indexOf('&count=30') > -1 &&
		req.indexOf('&active_status=all') > -1 &&
		req.indexOf('&ad_type=political_and_issue_ads') > -1 &&
		req.indexOf('&countries[0]=IT') > -1 &&
		req.indexOf('&impression_search_field=has_impressions_lifetime') > -1
	) { return true; }
	return false;
}

(async () => {

	// Dichiarazione variabili
	const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
			'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36';

	let activeStatusRequest = 'all',
		query = 'e',
		//num = '1500',
		num = '' + randomInt(800, 1200),

		gotoUrl = 'https://www.facebook.com/ads/library/' +
			'?active_status=' + activeStatusRequest + '&ad_type=political_and_issue_ads&country=IT' + 
			'&impression_search_field=has_impressions_lifetime&q=' + query

		fbAdsReqUrlOld = '';

	const browser = await puppeteer.launch();
	const page = await browser.newPage();

	await page.setUserAgent(userAgent);
	await page.setRequestInterception(true);
	await page.setDefaultTimeout(180000);
	// https://github.com/GoogleChrome/puppeteer/issues/1599
	await page._client.send('Network.enable', {
		maxResourceBufferSize: 1024 * 1204 * 50,
		maxTotalBufferSize: 1024 * 1204 * 100,
	});

	// Settaggio dell'intercettazione delle richieste
	page.on('request', req => {
		if (req.method() === 'POST') { debugMessage1('REQ ' + req.url()); }

		// Catturo la richiesta che scarica i dati e modifico il numero di risultati ritornati
		if (isReqData(req.url(), query) && req.method() === 'POST') {
			debugMessage3('Richiesta intercettata');

			fbAdsReqUrlOld = req.url();

			req.continue({
				'url': req.url().replace('&count=30', '&count='+num)
			});
			return;
		}

		// Si rigettano le immagini per velocizzare il caricamento
		//if (req.resourceType() === 'image') {
		//	req.abort();
		//	return;
		//}

		// Lascio immodificate le altre richieste
		req.continue();
	});

	page.on('response', async (resp) => {
		let req = resp.request();

		if (req.resourceType() == 'xhr') { debugMessage2('RESP ' + req.url()); }

		// A quanto pare l'url della richiesta rimane quello vecchio
		// https://github.com/GoogleChrome/puppeteer/issues/2233
		if (req.resourceType() == 'xhr' && req.url() == fbAdsReqUrlOld) {
			debugMessage3('Richiesta catturata');

			resp.text()
				.then((text) => {
					// Pulisco i dati (rimuovendo for (;;);) e convertendo in JSON
					text = text.replace('for (;;);', '');
					console.log(text.slice(0, 1500));
					text = JSON.parse(text);
					text = text['payload'];
					text = JSON.stringify(text, null, 2);

					// Salvo la risposta alla richiesta che mi interessa (quella che contiene i dati)
					let currentDate = new Date(),
						filenameOut = 'facebook_ads_' + 
							currentDate.toISOString().split('.')[0].replace('T', '_').replace(/:/g, '').replace(/-/g, '') + 
							'_' + query + '_' + num + '_' + activeStatusRequest + '.json';

					fs.writeFile(
						'facebook_ads/' + filenameOut, 
						text, 
						(err) => { 
							if (err) { 
								errorMessage('errore fs.writeFile()'); 
								errorMessage(err); 
								process.exit(1);
							}

							debugMessage3('Richiesta salvata');
							debugMessage3(filenameOut);
							debugMessage3('E\' possibile chiudere lo script');

							// Per sicurezza aspetto qualche secondo per essere
							// sicuro che il file sia salvato su disco
							setTimeout(() => { process.exit(1) }, 5000);
						}
					);
				})
				.catch((err) => { 
					errorMessage('errore resp.text()'); 
					errorMessage(err); 
					process.exit(1);
				});
		}
	});

	await page.goto(gotoUrl);
	await page.waitForNavigation();

})();
