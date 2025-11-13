const regexSuffixless = /\/[^/.]+$/; // e.g. "/some/page" but not "/", "/some/" or "/some.jpg"
const regexTrailingSlash = /.+\/$/; // e.g. "/some/" or "/some/page/" but not root "/"
const dynamicRouteRegex = /\/subpath\/\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b/; // e.g /urs/some-uuid; // e.g. '/subpath/uuid'

function handler(event, context, callback) {
    const request = event.request;
    const uri = request.uri;
    const suffix = '.html';
    const appendToDirs = 'index.html';
    const removeTrailingSlash =  false;
    
    //Checks for dynamic route and retrieves the proper [id].html file
    if (uri.match(dynamicRouteRegex)) {
        request.uri = "/subpath/[id].html";
        return request;
    }
    
    
    // Append ".html" to origin request
    if (suffix && uri.match(regexSuffixless)) {
        request.uri = uri + suffix;
        return request;
    }
    
    // Append "index.html" to origin request
    if (appendToDirs && uri.match(regexTrailingSlash)) {
        request.uri = uri + appendToDirs;
        return request;
    }

    // Redirect (301) non-root requests ending in "/" to URI without trailing slash
    if (removeTrailingSlash && uri.match(/.+\/$/)) {
        const response = {
            // body: '',
            // bodyEncoding: 'text',
            headers: {
                'location': [{
                    key: 'Location',
                    value: uri.slice(0, -1)
                 }]
            },
            status: '301',
            statusDescription: 'Moved Permanently'
        };
        return request;
    }
    return request;
}