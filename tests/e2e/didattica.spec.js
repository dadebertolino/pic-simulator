/**
 * Parte didattica: classi, consegne e progetti tramite API REST, con un
 * docente (autore) e due studenti (iscritti), e la dashboard [pic_dashboard].
 *
 * I passi dipendono l'uno dall'altro (la classe creata dal docente, la
 * consegna, il progetto dello studente): describe.serial, stato condiviso.
 */
const { test, expect } = require( '@playwright/test' );
const { USERS, stateFile, pageUrl, restClient } = require( './helpers' );

test.describe.configure( { mode: 'serial' } );

const SOURCE = '; consegna di prova\n    LIST P=16F84A\n    BSF STATUS, RP0\n    CLRF TRISB\n    BCF STATUS, RP0\nL:  INCF PORTB, F\n    GOTO L\n    END\n';

/** Sessioni e client REST dei tre utenti, aperti una volta per tutto lo spec. */
const as = {};
const ids = {};
const shared = {};

test.beforeAll( async ( { browser } ) => {
	for ( const key of Object.keys( USERS ) ) {
		const context = await browser.newContext( { storageState: stateFile( key ) } );
		as[ key ] = { context, api: await restClient( context.request ) };
		const me = await context.request.get( '/?rest_route=/wp/v2/users/me', {
			headers: { 'X-WP-Nonce': ( await ( await context.request.get( '/wp-admin/admin-ajax.php?action=rest-nonce' ) ).text() ).trim() },
		} );
		ids[ key ] = ( await me.json() ).id;
	}
} );

test.afterAll( async () => {
	for ( const { context } of Object.values( as ) ) await context.close();
} );

test.describe( 'classi', () => {
	test( 'il docente crea una classe e ottiene il codice di iscrizione', async () => {
		const res = await as.teacher.api.post( '/classes', { name: `3AEE e2e ${ Date.now() }`, year: '2026', section: 'A' } );
		expect( [ 200, 201 ], JSON.stringify( res.body ) ).toContain( res.status );
		expect( res.body.join_code ).toMatch( /^[A-Z0-9]{4,}$/ );
		shared.classId = res.body.id;
		shared.joinCode = res.body.join_code;
	} );

	test( 'uno studente non puo\' creare classi', async () => {
		const res = await as.student.api.post( '/classes', { name: 'non permessa' } );
		expect( res.status ).toBe( 403 );
	} );

	test( 'lo studente si iscrive con il codice; un codice errato e\' rifiutato', async () => {
		const wrong = await as.other.api.post( '/classes/join', { code: 'ZZZZZZ' } );
		expect( wrong.status ).toBeGreaterThanOrEqual( 400 );

		const res = await as.student.api.post( '/classes/join', { code: shared.joinCode } );
		expect( res.status, JSON.stringify( res.body ) ).toBe( 200 );
	} );

	test( 'il docente vede lo studente iscritto; gli studenti non vedono l\'elenco', async () => {
		const res = await as.teacher.api.get( `/classes/${ shared.classId }/students` );
		expect( res.status, JSON.stringify( res.body ) ).toBe( 200 );
		const list = Array.isArray( res.body ) ? res.body : res.body.students;
		expect( list.map( ( s ) => Number( s.id || s.user_id ) ) ).toContain( ids.student );

		expect( ( await as.student.api.get( `/classes/${ shared.classId }/students` ) ).status ).toBe( 403 );
		expect( ( await as.other.api.get( `/classes/${ shared.classId }/students` ) ).status ).toBe( 403 );
	} );

	test( 'chi non e\' iscritto non vede la classe, ne\' il codice', async () => {
		expect( ( await as.other.api.get( `/classes/${ shared.classId }` ) ).status ).toBe( 403 );

		const mine = await as.student.api.get( `/classes/${ shared.classId }` );
		expect( mine.status ).toBe( 200 );
		expect( mine.body.join_code ).toBeUndefined();
	} );
} );

test.describe( 'consegne e progetti', () => {
	test( 'il docente prepara un modello con il sorgente di partenza', async () => {
		const project = await as.teacher.api.post( '/projects', { name: 'Modello e2e', type: 'template', device: 'PIC16F84A' } );
		expect( [ 200, 201 ], JSON.stringify( project.body ) ).toContain( project.status );
		shared.templateId = project.body.id;

		// Il progetto nasce con un main.asm di partenza: lo si riscrive.
		const file = await as.teacher.api.put( `/projects/${ shared.templateId }/files/main.asm`, { content: SOURCE } );
		expect( file.status, JSON.stringify( file.body ) ).toBe( 200 );
	} );

	test( 'il docente crea e pubblica la consegna', async () => {
		const due = new Date( Date.now() + 7 * 864e5 ).toISOString().slice( 0, 19 ).replace( 'T', ' ' );
		const res = await as.teacher.api.post( '/assignments', {
			class_id: shared.classId, template_id: shared.templateId, title: 'Contatore su PORTB', due_date: due,
		} );
		expect( [ 200, 201 ], JSON.stringify( res.body ) ).toContain( res.status );
		shared.assignmentId = res.body.id;

		const pub = await as.teacher.api.post( `/assignments/${ shared.assignmentId }/publish` );
		expect( pub.status, JSON.stringify( pub.body ) ).toBe( 200 );
	} );

	test( 'uno studente non crea consegne e chi non e\' iscritto non le inizia', async () => {
		const res = await as.student.api.post( '/assignments', {
			class_id: shared.classId, template_id: shared.templateId, title: 'abusiva', due_date: '2030-01-01 00:00:00',
		} );
		expect( res.status ).toBe( 403 );
		expect( ( await as.other.api.post( `/assignments/${ shared.assignmentId }/start` ) ).status ).toBe( 403 );
	} );

	test( 'lo studente inizia la consegna e riceve il sorgente del modello', async () => {
		const list = await as.student.api.get( `/assignments?class_id=${ shared.classId }` );
		expect( list.status, JSON.stringify( list.body ) ).toBe( 200 );
		const items = Array.isArray( list.body ) ? list.body : list.body.assignments;
		expect( items.map( ( a ) => a.id ) ).toContain( shared.assignmentId );

		const start = await as.student.api.post( `/assignments/${ shared.assignmentId }/start` );
		expect( start.status, JSON.stringify( start.body ) ).toBe( 200 );
		shared.projectId = start.body.project_id;

		const file = await as.student.api.get( `/projects/${ shared.projectId }/files/main.asm` );
		expect( file.status, JSON.stringify( file.body ) ).toBe( 200 );
		expect( file.body.content ).toBe( SOURCE );
	} );

	test( 'lo studente modifica il suo progetto; gli altri studenti non lo vedono', async () => {
		const edit = await as.student.api.put( `/projects/${ shared.projectId }/files/main.asm`, { content: SOURCE + '; fatto\n' } );
		expect( edit.status, JSON.stringify( edit.body ) ).toBe( 200 );

		expect( ( await as.other.api.get( `/projects/${ shared.projectId }` ) ).status ).toBe( 403 );
		expect( ( await as.other.api.get( `/projects/${ shared.projectId }/files/main.asm` ) ).status ).toBe( 403 );
		expect( ( await as.other.api.put( `/projects/${ shared.projectId }/files/main.asm`, { content: 'x' } ) ).status ).toBe( 403 );
	} );

	test( 'dopo la consegna il progetto e\' bloccato', async () => {
		const res = await as.student.api.post( `/projects/${ shared.projectId }/submit` );
		expect( res.status, JSON.stringify( res.body ) ).toBe( 200 );
		expect( res.body.status ).toBe( 'submitted' );
		expect( res.body.locked ).toBe( true );

		const edit = await as.student.api.put( `/projects/${ shared.projectId }/files/main.asm`, { content: 'modifica tardiva' } );
		expect( edit.status ).toBeGreaterThanOrEqual( 400 );
	} );

	test( 'il docente vede la consegna e la valuta; lo studente vede il voto', async () => {
		const subs = await as.teacher.api.get( `/assignments/${ shared.assignmentId }/submissions` );
		expect( subs.status, JSON.stringify( subs.body ) ).toBe( 200 );
		expect( JSON.stringify( subs.body ) ).toContain( String( shared.projectId ) );

		const grade = await as.teacher.api.post( `/assignments/${ shared.assignmentId }/submissions/${ ids.student }/grade`, { grade: 8, grade_max: 10, notes: 'Bene' } );
		expect( grade.status, JSON.stringify( grade.body ) ).toBe( 200 );

		expect( ( await as.student.api.post( `/assignments/${ shared.assignmentId }/submissions/${ ids.student }/grade`, { grade: 10, grade_max: 10 } ) ).status ).toBe( 403 );

		const mine = await as.student.api.get( `/assignments/${ shared.assignmentId }/my-submission` );
		expect( mine.status, JSON.stringify( mine.body ) ).toBe( 200 );
		expect( JSON.stringify( mine.body ) ).toMatch( /"grade":"?8/ );
	} );

	test( 'un altro docente non vede classe, consegne e progetti del collega', async () => {
		const api = as.colleague.api;
		expect( ( await api.get( `/classes/${ shared.classId }/students` ) ).status ).toBe( 403 );
		expect( ( await api.get( `/assignments/${ shared.assignmentId }/submissions` ) ).status ).toBe( 403 );
		expect( ( await api.post( `/assignments/${ shared.assignmentId }/submissions/${ ids.student }/grade`, { grade: 1, grade_max: 10 } ) ).status ).toBe( 403 );
		expect( ( await api.get( `/projects/${ shared.projectId }/files/main.asm` ) ).status ).toBe( 403 );
		expect( ( await api.get( `/projects/${ shared.templateId }` ) ).status ).toBe( 403 );
	} );

	test( 'il docente legge il progetto dello studente della sua classe', async () => {
		const res = await as.teacher.api.get( `/projects/${ shared.projectId }/files/main.asm` );
		expect( res.status, JSON.stringify( res.body ) ).toBe( 200 );
		expect( res.body.content ).toContain( '; fatto' );
	} );
} );

test.describe( 'dashboard', () => {
	test( 'senza login chiede di accedere', async ( { page } ) => {
		await page.goto( pageUrl( 'dashboard' ) );
		await expect( page.locator( '.picsim-login-required' ) ).toContainText( 'Accesso richiesto' );
	} );

	for ( const [ key, teacher ] of [ [ 'teacher', 'true' ], [ 'student', 'false' ] ] ) {
		test( `si apre senza errori per ${ key === 'teacher' ? 'il docente' : 'lo studente' }`, async () => {
			const page = await as[ key ].context.newPage();
			const errors = [];
			page.on( 'pageerror', ( e ) => errors.push( e.message ) );
			page.on( 'console', ( m ) => {
				if ( m.type() === 'error' ) errors.push( m.text() );
			} );
			await page.goto( pageUrl( 'dashboard' ) );
			const root = page.locator( '#picsim-dashboard-root' );
			await expect( root ).toHaveAttribute( 'data-is-teacher', teacher );
			await expect( root ).not.toBeEmpty();
			expect( errors ).toEqual( [] );
			await page.close();
		} );
	}
} );
