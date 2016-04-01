var snorql = new Snorql();

String.prototype.trim = function () {
    return this.replace(/^\s*/, "").replace(/\s*$/, "");
}

String.prototype.startsWith = function(str) {
	return (this.match("^"+str) == str);
}

function showHidePrefixes()
{
	var prefixesButton = document.getElementById('prefixes_button');
	var prefixesText = document.getElementById('prefixestext');
	
	if (prefixesButton.value == 'Show Prefixes')
	{
		prefixesText.style.display = 'block';
		prefixesButton.value = 'Hide Prefixes'
	}
	else
	{
		prefixesText.style.display = 'none';
		prefixesButton.value = 'Show Prefixes'
	}
}

function Snorql() {
    // modify this._endpoint to point to your SPARQL endpoint
    this._endpoint = document.location.href.match(/^([^?]*)snorql\//)[1] + 'sparql';
    // modify these to your likeing
    this._poweredByLink = 'http://www4.wiwiss.fu-berlin.de/bizer/d2r-server/';
    this._poweredByLabel = 'D2R Server';
    this._enableNamedGraphs = false;

    this._browserBase = null;
    this._namespaces = {};
    this._graph = null;
    this._xsltDOM = null;

    this.setNamespaces = function(namespaces) {
        this._namespaces = namespaces;
        var prefixesElement = document.createTextNode(this._getPrefixes());
        this._display(prefixesElement, 'prefixestext');
    }

    this.start = function() {
        // TODO: Extract a QueryType class
        this.setBrowserBase(document.location.href.replace(/\?.*/, ''));
        this._displayEndpointURL();
        this._displayPoweredBy();
        this.setNamespaces(D2R_namespacePrefixes);
        this.updateOutputMode();
        var match = document.location.href.match(/\?(.*)/);
        var queryString = match ? match[1] : '';
        if (!queryString) {
            document.getElementById('querytext').value = 'SELECT DISTINCT * WHERE {\n  ?s ?p ?o\n}\nLIMIT 10';
            this._updateGraph(null, false);
            return;
        }
        var graph = queryString.match(/graph=([^&]*)/);
        graph = graph ? decodeURIComponent(graph[1]) : null;
        this._updateGraph(graph, false);
        var browse = queryString.match(/browse=([^&]*)/);
        var querytext = null;
        if (browse && browse[1] == 'superclasses') {
            var resultTitle = 'List of all super classes:';
            var querytext = 'SELECT DISTINCT ?class\n' +
                    'WHERE { [] rdfs:subClassOf ?class }\n' +
                    'ORDER BY ?class';
            var query = 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n' + querytext;
        }
        if (browse && browse[1] == 'classes') {
            var resultTitle = 'List of all classes:';
            var query = 'SELECT DISTINCT ?class\n' +
                    'WHERE { [] a ?class }\n' +
                    'ORDER BY ?class';
        }
        if (browse && browse[1] == 'properties') {
            var resultTitle = 'List of all properties:';
            var query = 'SELECT DISTINCT ?property\n' +
                    'WHERE { [] ?property [] }\n' +
                    'ORDER BY ?property';
        }
        if (browse && browse[1] == 'graphs') {
            var resultTitle = 'List of all named graphs:';
            var querytext = 'SELECT DISTINCT ?namedgraph ?label\n' +
                    'WHERE {\n' +
                    '  GRAPH ?namedgraph { ?s ?p ?o }\n' +
                    '  OPTIONAL { ?namedgraph rdfs:label ?label }\n' +
                    '}\n' +
                    'ORDER BY ?namedgraph';
            var query = 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n' + querytext;
        }
        var match = queryString.match(/property=([^&]*)/);
        if (match) {
            var resultTitle = 'All uses of property ' + decodeURIComponent(match[1]) + ':';
            var query = 'SELECT DISTINCT ?resource ?value\n' +
                    'WHERE { ?resource <' + decodeURIComponent(match[1]) + '> ?value }\n' +
                    'ORDER BY ?resource ?value';
        }
        var match = queryString.match(/class=([^&]*)/);
        if (match) {
            var resultTitle = 'All instances of class ' + decodeURIComponent(match[1]) + ':';
            var query = 'SELECT DISTINCT ?instance\n' +
                    'WHERE { ?instance a <' + decodeURIComponent(match[1]) + '> }\n' +
                    'ORDER BY ?instance';
        }
        var match = queryString.match(/describe=([^&]*)/);
        if (match) {
            var resultTitle = 'Description of ' + decodeURIComponent(match[1]) + ':';
            var query = 'SELECT DISTINCT ?property ?hasValue ?isValueOf\n' +
                    'WHERE {\n' +
                    '  { <' + decodeURIComponent(match[1]) + '> ?property ?hasValue }\n' +
                    '  UNION\n' +
                    '  { ?isValueOf ?property <' + decodeURIComponent(match[1]) + '> }\n' +
                    '}\n' +
                    'ORDER BY (!BOUND(?hasValue)) ?property ?hasValue ?isValueOf';
        }
        if (queryString.match(/query=/)) {
            var resultTitle = 'SPARQL results:';
            querytext = this._betterUnescape(queryString.match(/query=([^&]*)/)[1]);
            
            var this_prefixes = '';
            
            var prefix_array = prefixes.split('\n');
            
            for (var i = 0; i < prefix_array.length; i++)
            {
            	var prefix = prefix_array[i];
            	
            	if (querytext.indexOf(prefix) == -1)
            		this_prefixes += prefix + '\n';
            }
			
			var query_lines = querytext.split('\n');
			
			for (var i = 0; i < query_lines.length; i++)
			{
				var line = query_lines[i];
				
				if (line.match(/prefix/i))
				{
					var parts = line.split(' ');
					
					if (parts.length > 2 && parts[0].toUpperCase() == 'PREFIX')
						this._namespaces[parts[1].replace(':', '')] = parts[2].substring(1, parts[2].length - 1);
				}
				else
				{
					break;
				}
			}
            
            var query = this_prefixes + querytext;
        }
		var sendAsMethod = "query";
        if (queryString.match(/sendas=/)) {
            sendAsMethod = queryString.match(/sendas=([^&]*)/)[1];
			document.getElementById('selectsendas').value = sendAsMethod;
        }
        if (!querytext) {
            querytext = query;
        }
        document.getElementById('querytext').value = querytext;
        this.displayBusyMessage();
        var service = new SPARQL.Service(this._endpoint);
        if (this._graph) {
            service.addDefaultGraph(this._graph);
        }

        // AndyL changed MIME type and success callback depending on query form...
        var dummy = this;
        
   	    var exp = /^\s*(?:PREFIX\s+\w*:\s+<[^>]*>\s*)*(\w+)\s*.*/i;
   	    var match = exp.exec(querytext);
   	    if (match) {
	        if (match[1].toUpperCase() == 'ASK') {
	        	service.setOutput('json');
	        	var successFunc = function(value) {
	                dummy.displayBooleanResult(value, resultTitle);
	            };
	        } else if (match[1].toUpperCase() == 'CONSTRUCT' || match[1].toUpperCase() == 'DESCRIBE'){ // construct describe
	    		service.setOutput('rdf'); // !json
	    		var successFunc = function(model) {
	                dummy.displayRDFResult(model, resultTitle);
	            };
	        } else {
	        	service.setRequestHeader('Accept', 'application/sparql-results+json,*/*');
	        	service.setOutput('json');
	        	var successFunc = function(json) {
	        		dummy.displayJSONResult(json, resultTitle);
	        	};
	        }
   	    }
   	    
        service.query
		(
			query,
			{
				success: successFunc,
				failure: function(report)
				{
					var message = report.responseText.match(/<pre>([\s\S]*)<\/pre>/);
					if (message) {
						dummy.displayErrorMessage(message[1]);
					} else {
						dummy.displayErrorMessage(report.responseText);
					}
				}
			},
			sendAsMethod
		);
    }

    this.setBrowserBase = function(url) {
        this._browserBase = url;
    }

    this._displayEndpointURL = function() {
        var newTitle = 'Snorql: Exploring ' + this._endpoint;
        this._display(document.createTextNode(newTitle), 'title');
        document.title = newTitle;
    }

    this._displayPoweredBy = function() {
        $('poweredby').href = this._poweredByLink;
        $('poweredby').update(this._poweredByLabel);
    }

    this.switchToGraph = function(uri) {
        this._updateGraph(uri, true);
    }

    this.switchToDefaultGraph = function() {
        this._updateGraph(null, true);
    }

    this._updateGraph = function(uri, effect) {
        if (!this._enableNamedGraphs) {
            $('default-graph-section').hide();
            $('named-graph-section').hide();
            $('browse-named-graphs-link').hide();
            return;
        }
        var changed = (uri != this._graph);
        this._graph = uri;
        var el = document.getElementById('graph-uri');
        el.disabled = (this._graph == null);
        el.value = this._graph;
        if (this._graph == null) {
            var show = 'default-graph-section';
            var hide = 'named-graph-section';
            $$('a.graph-link').each(function(link) {
                match = link.href.match(/^(.*)[&?]graph=/);
                if (match) link.href = match[1];
            });
        } else {
            var show = 'named-graph-section';
            var hide = 'default-graph-section';
            $('selected-named-graph').update(this._graph);
            var uri = this._graph;
            $$('a.graph-link').each(function(link) {
                match = link.href.match(/^(.*)[&?]graph=/);
                if (!match) link.href = link.href + '&graph=' + uri;
            });
        }
        $(hide).hide();
        $(show).show();
        if (effect && changed) {
            new Effect.Highlight(show,
                {startcolor: '#ffff00', endcolor: '#ccccff', resotrecolor: '#ccccff'});
        }
        $('graph-uri').disabled = (this._graph == null);
        $('graph-uri').value = this._graph;
    }

    this.updateOutputMode = function() {
        if (this._xsltDOM == null) {
            this._xsltDOM = document.getElementById('xsltinput');
        }
        var el = document.getElementById('xsltcontainer');
        while (el.childNodes.length > 0) {
            el.removeChild(el.firstChild);
        }
        if (this._selectedOutputMode() == 'xslt') {
            el.appendChild(this._xsltDOM);
        }
    }

    this.resetQuery = function() {
        document.location = this._browserBase;
    }

    this.submitQuery = function() {
        var mode = this._selectedOutputMode();
        if (mode == 'browse') {
            document.getElementById('queryform').action = this._browserBase;
            document.getElementById('query').value = document.getElementById('querytext').value;
            document.getElementById('sendas').value = document.getElementById('selectsendas').value;
	        document.getElementById('format').disabled = true;
        } else {
			if (document.getElementById('selectsendas').value == 'update')
			{
				document.getElementById('query').disabled = true;
				document.getElementById('update').disabled = false;
				document.getElementById('update').value = this._getPrefixes() + document.getElementById('querytext').value;
				document.getElementById('queryform').method = 'POST';
			}
			else
			{
				document.getElementById('query').disabled = false;
				document.getElementById('update').disabled = true;
				document.getElementById('query').value = this._getPrefixes() + document.getElementById('querytext').value;
				document.getElementById('queryform').method = 'GET';
			}
			document.getElementById('sendas').disabled = true;
            document.getElementById('queryform').action = this._endpoint;
        }
        document.getElementById('format').disabled = false;
		document.getElementById('format').value = mode;
        document.getElementById('jsonoutput').disabled = (mode != 'json');
        document.getElementById('stylesheet').disabled = (mode != 'xslt' || !document.getElementById('xsltstylesheet').value);
        if (mode == 'xslt') {
            document.getElementById('stylesheet').value = document.getElementById('xsltstylesheet').value;
        }
        document.getElementById('queryform').submit();
    }

    this.displayBusyMessage = function() {
        var busy = document.createElement('div');
        busy.className = 'busy';
        busy.appendChild(document.createTextNode('Executing query ...'));
        this._display(busy, 'result');
    }

    this.displayErrorMessage = function(message) {
        var pre = document.createElement('pre');
        pre.innerHTML = message;
        this._display(pre, 'result');
    }

    this.displayBooleanResult = function(value, resultTitle) {
        var div = document.createElement('div');
        var title = document.createElement('h2');
        title.appendChild(document.createTextNode(resultTitle));
        div.appendChild(title);
		div.appendChild(document.createTextNode(value.boolean));
        this._display(div, 'result');
        this._updateGraph(this._graph); // refresh links in new result
    }
    
    this.displayRDFResult = function(model, resultTitle) {
        var div = document.createElement('div');
        var title = document.createElement('h2');
        title.appendChild(document.createTextNode(resultTitle));
        div.appendChild(title);
        div.appendChild(new RDFXMLFormatter(model));
        this._display(div, 'result');
        this._updateGraph(this._graph); // refresh links in new result - necessary for boolean?
    }
    
    this.displayJSONResult = function(json, resultTitle) {
        var div = document.createElement('div');
        var title = document.createElement('h2');
        title.appendChild(document.createTextNode(resultTitle));
        div.appendChild(title);
		
		if (json.results)
		{
			if (json.results.bindings.length == 0) {
				var p = document.createElement('p');
				p.className = 'empty';
				p.appendChild(document.createTextNode('[no results]'));
				div.appendChild(p);
			} else {
				var result = new SPARQLResultFormatter(json, this._namespaces).toDOM()
				div.appendChild(result);
			}
		}
		else
		{
			var p = document.createElement('p');
			p.className = 'empty';
			p.innerHTML = json;
			div.appendChild(p);
		}
		
        this._display(div, 'result');
        this._updateGraph(this._graph); // refresh links in new result
    }

    this._display = function(node, whereID) {
        var where = document.getElementById(whereID);
        if (!where) {
            alert('ID not found: ' + whereID);
            return;
        }
        while (where.firstChild) {
            where.removeChild(where.firstChild);
        }
        if (node == null) return;
        where.appendChild(node);
    }

    this._selectedOutputMode = function() {
        return document.getElementById('selectoutput').value;
    }

    this._selectedSendAs = function() {
        return document.getElementById('selectsendas').value;
    }

    this._getPrefixes = function() {
        prefixes = '';
        for (prefix in this._namespaces) {
            var uri = this._namespaces[prefix];
            prefixes = prefixes + 'PREFIX ' + prefix + ': <' + uri + '>\n';
        }
        return prefixes;
    }

    this._betterUnescape = function(s) {
        return decodeURIComponent(s.replace(/\+/g, ' '));
        //return unescape(s.replace(/\+/g, ' '));
    }
}


/*
 * RDFXMLFormatter
 * 
 * maybe improve...
 */
function RDFXMLFormatter(string) {
	var pre = document.createElement('pre');
	pre.appendChild(document.createTextNode(string));
	return pre;
}

/*
===========================================================================
SPARQLResultFormatter: Renders a SPARQL/JSON result set into an HTML table.

var namespaces = { 'xsd': '', 'foaf': 'http://xmlns.com/foaf/0.1' };
var formatter = new SPARQLResultFormatter(json, namespaces);
var tableObject = formatter.toDOM();
*/
function SPARQLResultFormatter(json, namespaces) {
    this._json = json;
    this._variables = this._json.head.vars;
    this._results = this._json.results.bindings;
    this._namespaces = namespaces;

    this.toDOM = function() {
        var tableUp = document.createElement('table');
        tableUp.className = 'queryresults';
        var table= document.createElement('tbody');
        tableUp.appendChild(table);
        table.appendChild(this._createTableHeader());
        for (var i = 0; i < this._results.length; i++) {
            table.appendChild(this._createTableRow(this._results[i], i));
        }
        return tableUp;
    }

    // TODO: Refactor; non-standard link makers should be passed into the class by the caller
    this._getLinkMaker = function(varName) {
        if (varName == 'property') {
            return function(uri) { return '?property=' + encodeURIComponent(uri); };
        } else if (varName == 'class') {
            return function(uri) { return '?class=' + encodeURIComponent(uri); };
        } else {
            return function(uri) { return '?describe=' + encodeURIComponent(uri); };
        }
    }

    this._createTableHeader = function() {
        var tr = document.createElement('tr');
        var hasNamedGraph = false;
        for (var i = 0; i < this._variables.length; i++) {
            var th = document.createElement('th');
            th.appendChild(document.createTextNode(this._variables[i]));
            tr.appendChild(th);
            if (this._variables[i] == 'namedgraph') {
                hasNamedGraph = true;
            }
        }
        if (hasNamedGraph) {
            var th = document.createElement('th');
            th.appendChild(document.createTextNode(' '));
            tr.insertBefore(th, tr.firstChild);
        }
        return tr;
    }

    this._createTableRow = function(binding, rowNumber) {
        var tr = document.createElement('tr');
        if (rowNumber % 2) {
            tr.className = 'odd';
        } else {
            tr.className = 'even';
        }
        var namedGraph = null;
        for (var i = 0; i < this._variables.length; i++) {
            var varName = this._variables[i];
            td = document.createElement('td');
            td.appendChild(this._formatNode(binding[varName], varName));
            tr.appendChild(td);
            if (this._variables[i] == 'namedgraph') {
                namedGraph = binding[varName];
            }
        }
        if (namedGraph) {
            var link = document.createElement('a');
            link.href = 'javascript:snorql.switchToGraph(\'' + namedGraph.value + '\')';
            link.appendChild(document.createTextNode('Switch'));
            var td = document.createElement('td');
            td.appendChild(link);
            tr.insertBefore(td, tr.firstChild);
        }
        return tr;
    }

    this._formatNode = function(node, varName) {
        if (!node) {
            return this._formatUnbound(node, varName);
        }
        if (node.type == 'uri') {
            return this._formatURI(node, varName);
        }
        if (node.type == 'bnode') {
            return this._formatBlankNode(node, varName);
        }
        if (node.type == 'literal') {
            return this._formatPlainLiteral(node, varName);
        }
        if (node.type == 'typed-literal') {
            return this._formatTypedLiteral(node, varName);
        }
        return document.createTextNode('???');
    }

    this._formatURI = function(node, varName) {
        var span = document.createElement('span');
        span.className = 'uri';
        var a = document.createElement('a');
        a.href = this._getLinkMaker(varName)(node.value);
        a.title = '<' + node.value + '>';
        a.className = 'graph-link';
        var qname = this._toQName(node.value);
        if (qname) {
            a.appendChild(document.createTextNode(qname));
            span.appendChild(a);
        } else {
            a.appendChild(document.createTextNode(node.value));
            span.appendChild(document.createTextNode('<'));
            span.appendChild(a);
            span.appendChild(document.createTextNode('>'));
        }
        match = node.value.match(/^(https?|ftp|mailto|irc|gopher|news):/);
        if (match) {
            span.appendChild(document.createTextNode(' '));
            var externalLink = document.createElement('a');
            externalLink.href = node.value;
            img = document.createElement('img');
            img.src = 'link.png';
            img.alt = '[' + match[1] + ']';
            img.title = 'Go to Web page';
            externalLink.appendChild(img);
            span.appendChild(externalLink);
        }
        return span;
    }

    this._formatPlainLiteral = function(node, varName) {
        var text = '"' + node.value + '"';
        if (node['xml:lang']) {
            text += '@' + node['xml:lang'];
        }
        return document.createTextNode(text);
    }

    this._formatTypedLiteral = function(node, varName) {
        var text = '"' + node.value + '"';
        if (node.datatype) {
            text += '^^' + this._toQNameOrURI(node.datatype);
        }
        if (this._isNumericXSDType(node.datatype)) {
            var span = document.createElement('span');
            span.title = text;
            span.appendChild(document.createTextNode(node.value));
            return span;
        }
        return document.createTextNode(text);
    }

    this._formatBlankNode = function(node, varName) {
        return document.createTextNode('_:' + node.value);
    }

    this._formatUnbound = function(node, varName) {
        var span = document.createElement('span');
        span.className = 'unbound';
        span.title = 'Unbound'
        span.appendChild(document.createTextNode('-'));
        return span;
    }

    this._toQName = function(uri) {
        for (prefix in this._namespaces) {
            var nsURI = this._namespaces[prefix];
            if (uri.indexOf(nsURI) == 0) {
                return prefix + ':' + uri.substring(nsURI.length);
            }
        }
        return null;
    }

    this._toQNameOrURI = function(uri) {
        var qName = this._toQName(uri);
        return (qName == null) ? '<' + uri + '>' : qName;
    }

    this._isNumericXSDType = function(datatypeURI) {
        for (i = 0; i < this._numericXSDTypes.length; i++) {
            if (datatypeURI == this._xsdNamespace + this._numericXSDTypes[i]) {
                return true;
            }
        }
        return false;
    }
    this._xsdNamespace = 'http://www.w3.org/2001/XMLSchema#';
    this._numericXSDTypes = ['long', 'decimal', 'float', 'double', 'int',
        'short', 'byte', 'integer', 'nonPositiveInteger', 'negativeInteger',
        'nonNegativeInteger', 'positiveInteger', 'unsignedLong',
        'unsignedInt', 'unsignedShort', 'unsignedByte'];
}
