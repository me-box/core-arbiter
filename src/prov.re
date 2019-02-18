open Lwt.Infix;

type t = {
  code: int,
  uri_path: string,
  uri_host: string,
  content_format: int,
  token: string,
  options: array((int, string))
};

let create = (~code, ~options, ~token) =>
  Protocol.Zest.{
    code,
    uri_path: get_uri_path(options),
    uri_host: get_uri_host(options),
    content_format: get_content_format(options),
    token,
    options
  };

let code_as_string = (t) =>
  switch t.code {
  | 1 => "GET"
  | 2 => "POST"
  | 4 => "DELETE"
  | _ => "UNDEFINED"
  };

let content_format_as_string = (t) =>
  switch t.content_format {
  | 0 => "text"
  | 50 => "json"
  | 42 => "binary"
  | _ => "unknown"
  };

let info = (t, e) =>
  Printf.sprintf(
    "event = %s, trigger = (host=%s, method=%s, format=%s, path=%s)",
    e,
    t.uri_host,
    code_as_string(t),
    content_format_as_string(t),
    t.uri_path
  );

let ident = (t) => (t.uri_path, t.content_format);

let code = (t) => t.code;

let uri_path = (t) => t.uri_path;

let uri_host = (t) => t.uri_host;

let content_format = (t) => t.content_format;

let token = (t) => t.token;

let observed = (t) => Protocol.Zest.get_observed(t.options);

let max_age = (t) => Protocol.Zest.get_max_age(t.options);