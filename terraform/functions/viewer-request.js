// /app and /app/* used to be the mRNA design app on this domain. Send them to
// the app's own domain without the prefix, keeping the query string. 302, not
// 301, because browsers cache a 301 indefinitely. cloudfront.tf fills in the
// domain below with templatefile().
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri !== '/app' && uri.indexOf('/app/') !== 0) {
    return request;
  }

  var query = [];
  var params = request.querystring;
  for (var key in params) {
    var values = params[key].multiValue || [params[key]];
    for (var i = 0; i < values.length; i++) {
      query.push(values[i].value === '' ? key : key + '=' + values[i].value);
    }
  }

  var location = 'https://${app_domain}' + (uri.slice(4) || '/');
  if (query.length) {
    location += '?' + query.join('&');
  }

  return {
    statusCode: 302,
    statusDescription: 'Found',
    headers: { location: { value: location } },
  };
}
