
open Lwt.Infix;

let rep_endpoint = ref("tcp://0.0.0.0:4444");
let router_endpoint = ref("tcp://0.0.0.0:4445");
let log_mode = ref(false);
let server_secret_key_file = ref("");
let server_secret_key = ref("");
let router_secret_key = ref("");
let router_public_key = ref("");
let token_secret_key = ref("");
let token_secret_key_file = ref("");
let databox = ref(false);
let identity = ref(Unix.gethostname ());

type t = {
  zmq_ctx: Protocol.Zest.t,
  state_ctx: State.t,
  hypercat_ctx: Hypercat.t,
  observe_ctx: Observe.t,
  version: int
};

module Ack = {
  type t =
    | Code(int)
    | Payload(int, string)
    | Observe(string, string)
};

let parse_cmdline = () => {
  let usage = "usage: " ++ Sys.argv[0];
  let speclist = [
    ("--request-endpoint", Arg.Set_string(rep_endpoint), ": to set the request/reply endpoint"),
    ("--router-endpoint", Arg.Set_string(router_endpoint), ": to set the router/dealer endpoint"),
    ("--identity", Arg.Set_string(identity), ": to set the server identity"),
    ("--enable-logging", Arg.Set(log_mode), ": turn debug mode on"),
    ("--databox", Arg.Set(databox), ": enable Databox mode"),
    ("--secret-key-file", Arg.Set_string(server_secret_key_file), ": to set the curve secret key"),
    ("--token-key-file", Arg.Set_string(token_secret_key_file), ": to set the token secret key")
    ];
    Arg.parse(speclist, (x) => raise(Arg.Bad("Bad argument : " ++ x)), usage);
};

let init = (zmq_ctx)  => {
  zmq_ctx: zmq_ctx,
  state_ctx: State.create(),
  hypercat_ctx: Hypercat.create(),
  observe_ctx: Observe.create(),
  version: 1
};

let get_time = () => {
  let t_sec = Unix.gettimeofday();
  let t_ms = t_sec *. 1000.0;
  int_of_float(t_ms);
};

let data_from_file = (file) =>
  Fpath.v(file)
  |> Bos.OS.File.read
  |> (
    (result) =>
      switch result {
      | Rresult.Error(_) => failwith("failed to access file")
      | Rresult.Ok(key) => key
      }
  );

let set_server_key = (file) => 
  if (file != "") {server_secret_key := data_from_file(file)};

let set_token_key = (file) => 
  if (file != "") {token_secret_key := data_from_file(file)};


let enable_databox_mode = () => {
  server_secret_key := data_from_file("/run/secrets/ZMQ_SECRET_KEY"); 
  token_secret_key := data_from_file("/run/secrets/CM_KEY");
};


let setup_router_keys = () => {
  let (public_key, private_key) = ZMQ.Curve.keypair();
  router_secret_key := private_key;
  router_public_key := public_key;
};

let ack = (kind) =>
  Ack.(
    (
      switch kind {
      | Code(n) => Protocol.Zest.create_ack(n)
      | Payload(format, data) => Protocol.Zest.create_ack_payload(format, data)
      | Observe(key, uuid) => Protocol.Zest.create_ack_observe(key, uuid)
      }
    )
  );

let unhandled_error = (e, ctx) => {
  let msg = Printexc.to_string(e);
  let stack = Printexc.get_backtrace();
  Logger.error_f("unhandled_error", Printf.sprintf("%s%s", msg, stack))
  >>= () => Protocol.Zest.send(ctx.zmq_ctx, ack(Ack.Code(160)));
};

let handle_options = (oc, bits) => {
  let options = Array.make(oc, (0, ""));
  let rec handle = (oc, bits) =>
    if (oc == 0) {
      bits;
    } else {
      let (number, value, r) = Protocol.Zest.handle_option(bits);
      let _ = Logger.debug_f("handle_options", Printf.sprintf("%d:%s", number, value));
      options[oc - 1] = (number, value);
      handle(oc - 1, r);
    };
  (options, handle(oc, bits));
};

let handle_get_status = (ctx, prov) => {
  Ack.Code(65);
};

let create_uuid = () => Uuidm.v4_gen(Random.State.make_self_init(), ()) |> Uuidm.to_string;


let handle_get_store_secret = (ctx, prov) => {
  open Ezjsonm;
  let uri_host = Prov.uri_host(prov);
  if (State.exists(ctx.state_ctx, uri_host)) {
    let record = State.get(ctx.state_ctx, uri_host);
    let secret = create_uuid();
    let json = update(value(record), ["secret"], Some(string(secret)));
    let obj = `O(get_dict(json));
    State.replace(ctx.state_ctx, uri_host, obj);
    Ack.Payload(0, secret);
  } else {
    Ack.Code(129); 
  }
};

let handle_get_cat = (ctx, prov) => {
  let json = Hypercat.get(ctx.hypercat_ctx);
  Ack.Payload(50, Ezjsonm.to_string(json));
};

let create_audit_payload_worker = (prov, code, resp_code) => {
  open Protocol.Zest;
  let uri_host = Prov.uri_host(prov);
  let uri_path = Prov.uri_path(prov);
  let timestamp = get_time();
  let server = identity^;
  create_ack_payload(
    69,
    Printf.sprintf("%d %s %s %s %s %d", timestamp, server, uri_host, code, uri_path, resp_code)
  );
};

let create_audit_payload = (prov, status, payload) =>
  switch prov {
  | Some((prov')) =>
    let meth = Prov.code_as_string(prov');
    switch status {
    | Ack.Code(163) => Some(payload)
    | Ack.Code(n) => Some(create_audit_payload_worker(prov', meth, n))
    | Ack.Payload(_) => Some(create_audit_payload_worker(prov', meth, 69))
    | Ack.Observe(_) => Some(create_audit_payload_worker(prov', "GET(OBSERVE)", 69))
    };
  | None => Some(payload)
  };

let create_data_payload_worker = (prov, payload) =>
  switch prov {
  | Some((prov')) =>
    let uri_path = Prov.uri_path(prov');
    let content_format = Prov.content_format_as_string(prov');
    let timestamp = get_time();
    let entry = Printf.sprintf("%d %s %s %s", timestamp, uri_path, content_format, payload);
    Protocol.Zest.create_ack_payload(69, entry);
  | None => Protocol.Zest.create_ack(163)
  };

let create_data_payload = (prov, status, payload) =>
  switch status {
  | Ack.Code(163) => Some(payload)
  | Ack.Observe(_) => None
  | Ack.Code(128) => None
  | Ack.Code(129) => None
  | Ack.Code(143) => None
  | Ack.Code(66) => None
  | Ack.Payload(_) when payload == "" => None
  | Ack.Payload(_) => Some(create_data_payload_worker(prov, payload))
  | Ack.Code(_) => Some(create_data_payload_worker(prov, payload))
  };

let create_router_payload = (prov, mode, status, payload) =>
  switch mode {
  | "data" => create_data_payload(prov, status, payload)
  | "audit" => create_audit_payload(prov, status, payload)
  | _ => Some(Protocol.Zest.create_ack(128))
  };


let route_message = (alist, ctx, status, payload, prov) => {
  open Logger;
  let rec loop = (l) =>
    switch l {
    | [] => Lwt.return_unit
    | [(ident, expiry, mode), ...rest] =>
      switch (create_router_payload(prov, mode, status, payload)) {
      | Some((payload')) =>
        Protocol.Zest.route(ctx.zmq_ctx, ident, payload')
        >>= (
          () =>
            debug_f(
              "routing",
              Printf.sprintf(
                "Routing:\n%s to ident:%s with expiry:%lu and mode:%s",
                to_hex(payload'),
                ident,
                expiry,
                mode
              )
            )
            >>= (() => loop(rest))
        )
      | None => loop(rest)
      }
    };
  loop(alist);
};

let route = (status, payload, ctx, prov) => {
  let key = Prov.ident(prov);
  route_message(Observe.get(ctx.observe_ctx, key), ctx, status, payload, Some(prov));
};


let handle_get = (ctx, prov) => {
  let uri_path = Prov.uri_path(prov);
  let path_list = String.split_on_char('/', uri_path);
  let observed = Prov.observed(prov);
  if ((observed == "data") || (observed == "audit")) {
    let uuid = create_uuid();
    let status = Ack.Observe(router_public_key^, uuid);
    let _ = Observe.add(ctx.observe_ctx, uuid, prov) >>= () => route(status, "", ctx, prov);
    status;
  } else {
    switch path_list {
      | ["", "status"] => handle_get_status(ctx, prov);
      | ["", "store", "secret"] => handle_get_store_secret(ctx, prov);
      | ["", "cat"] => handle_get_cat(ctx, prov);
      | _ => Ack.Code(128); 
      };
  };
};


let to_json = (payload) => {
  open Ezjsonm;
  let parsed =
    try (Some(from_string(payload))) {
    | Parse_error(_) => None
    };
  parsed;
};


let is_valid_token_data = (json) => {
  open Ezjsonm;
  mem(json, ["path"]) && mem(json, ["method"]) && mem(json, ["target"]); 
};



let mint_token = (~path, ~meth, ~target, ~key, ~optional=None, ()) => {
  open Printf;
  let path = sprintf("path = %s", path);
  let meth = sprintf("method = %s", meth);
  let target = sprintf("target = %s", target);
  let token = Mint.mint_token(~path, ~meth, ~optional, ~target, ~key, ());
  Ack.Payload(0,token);
};

let get_route = (record) => {
  open Ezjsonm;
  let arr = find(value(record), ["permissions"]);
  `A(get_list((x) => find(x,["route"]), arr));
};

let path_match = (s1, s2) => {
  String.(length(s1) <= length(s2) && s1 == sub(s2, 0, length(s1) - 1) ++ "*");
};


let route_exists_worker = (r1, r2) => {
  open Ezjsonm;
  let path = get_string(find(r1, ["path"]));
  let meth = find(r1, ["method"]);
  let meth' = find(r2, ["method"]);
  let target = find(r1, ["target"]);
  let target' = find(r2, ["target"]);
  let path' = get_string(find(r2, ["path"]));
  if (Str.last_chars(path, 1) == "*") {
    path_match(path,path') && meth == meth' && target == target'; 
  } else {
    path == path' && meth == meth' && target == target'; 
  };
};

let route_exists = (record, route) => {
  open Ezjsonm;
  let arr = get_route(record);
  let lis = get_list((x) => x, arr);
  List.exists((x) => route_exists_worker(x,route)) (lis);
  /* List.exists((x) => x == route) (lis); */
};


let get_secret = (ctx, target) => {
  open Ezjsonm;
  if (State.exists(ctx.state_ctx, target)) {
    let record = State.get(ctx.state_ctx, target);
    get_string(find(value(record), ["secret"]));
  } else {
    "";
  }
};

let get_caveats = (json) => {
  open Ezjsonm;
  get_list((x) => find(x,["caveats"]), json);
};

let string_of_caveat_worker = (x,y) => {
  Some(Printf.sprintf("%s = %s", x, Ezjsonm.get_string(y)));
};

let string_of_caveat = (caveat) => {
  open Ezjsonm;
  switch (get_list(get_dict, caveat)) {
  | [ [(x,y)] ] when x == "observe" => string_of_caveat_worker(x,y);
  | [ [(x,y)] ] when x == "destination" => string_of_caveat_worker(x,y)
  | _ => None;
  } 
};

let handle_token = (ctx, prov, json) => {
  open Ezjsonm;
  let uri_host = Prov.uri_host(prov);
  if (State.exists(ctx.state_ctx, uri_host)) {
    let record = State.get(ctx.state_ctx, uri_host);
    let permissions = find(value(record), ["permissions"]);
    let target = get_string(find(json, ["target"]));
    let secret = get_secret(ctx, target);
    if (permissions != dict([]) && secret != "") {
      if (route_exists(record, json)) {
        let path = get_string(find(json, ["path"]));
        let meth = get_string(find(json, ["method"]));
        let permission_caveats = get_list((x) => find(x,["caveats"]), permissions);
        let route_caveat = find(json,["caveats"]);
        if (List.exists(x => x == route_caveat, permission_caveats)) {
          mint_token(~path=path, ~meth=meth, ~optional=string_of_caveat(route_caveat), ~target=target, ~key=secret, ());
        } else {
          Ack.Code(129);
        }
      } else {
        Ack.Code(129);
      }
    } else {
      Ack.Code(129);
    };
  } else {
    Ack.Code(129);
  };
};

let handle_post_token = (ctx, prov, payload) => {
  switch (to_json(payload)) {
    | Some(json) => is_valid_token_data(json) ? handle_token(ctx,prov,json) : Ack.Code(128); 
    | None => Ack.Code(128); 
    };
};

let is_valid_upsert_container_info_data = (json) => {
  open Ezjsonm;
  mem(json, ["name"]) && mem(json, ["type"]) && mem(json, ["key"]); 
};

let upsert_container_info = (ctx, prov, json) => {
  open Ezjsonm;
  let name = get_string(find(json, ["name"]));
  Hypercat.add(ctx.hypercat_ctx, name);
  let json' = update(json, ["permissions"], Some(`A([])));
  let json'' = update(json', ["secret"], Some(string("")));
  let obj = `O(get_dict(json''));
  State.add(ctx.state_ctx, name, obj);
  let _ = Logger.info_f("upsert_container_info", to_string(obj));
  Ack.Payload(0,name);
};

let handle_post_upsert_container_info = (ctx, prov, payload) => {
  switch (to_json(payload)) {
    | Some(json) => is_valid_upsert_container_info_data(json) ? upsert_container_info(ctx, prov, json) : Ack.Code(128); 
    | None => Ack.Code(128); 
    };
};

let is_valid_delete_container_info_data = (json) => {
  open Ezjsonm;
  mem(json, ["name"]); 
};

let delete_container_info = (ctx, prov, json) => {
  open Ezjsonm;
  let name = get_string(find(json, ["name"]));
  Hypercat.remove(ctx.hypercat_ctx, name);
  State.remove(ctx.state_ctx, name);
  Ack.Code(66);
};


let handle_post_delete_container_info = (ctx, prov, payload) => {
  switch (to_json(payload)) {
    | Some(json) => is_valid_delete_container_info_data(json) ? delete_container_info(ctx,prov,json) : Ack.Code(128); 
    | None => Ack.Code(128); 
    };
};

let is_valid_container_permissions_data = (ctx, json) => {
  open Ezjsonm;
  mem(json, ["name"]) && 
  mem(json, ["route", "target"]) && 
  mem(json, ["route", "path"]) && 
  mem(json, ["route", "method"]) && 
  mem(json, ["caveats"]);
};





let add_permissions = (record, item) => {
  open Ezjsonm;
  let json = find(value(record), ["permissions"]);
  let lis = get_list((x) => x, json);
  let lis' = List.append(lis, [item]);
  list((x) => x, lis');
};

let grant_container_permissions = (ctx, prov, json) => {
  open Ezjsonm;
  let name = get_string(find(json, ["name"]));
  if (State.exists(ctx.state_ctx, name)) {
    let record = State.get(ctx.state_ctx, name);
    if (!route_exists(record, find(json, ["route"]))) {
      let record' = update(value(record), ["permissions"], Some(add_permissions(record, json)));
      let obj = `O(get_dict(record'));
      State.replace(ctx.state_ctx, name, obj);
      let _ = Logger.info_f("grant_container_permissions", to_string(obj));
      let arr = `A(get_list((x) => x, get_route(obj)));
      Ack.Payload(50,to_string(arr));
    } else {
      Ack.Code(134);
    }
  } else {
    Ack.Code(129)
  };
};

let remove_permissions = (record, item) => {
  open Ezjsonm;
  let json = find(value(record), ["permissions"]);
  let lis = get_list((x) => x, json);
  let route = find(item, ["route"]);
  let lis' = List.filter((x) => (find(x, ["route"]) != route), lis);
  list((x) => x, lis');
};

let revoke_container_permissions = (ctx, prov, json) => {
  open Ezjsonm;
  let name = get_string(find(json, ["name"]));
  if (State.exists(ctx.state_ctx, name)) {
    let record = State.get(ctx.state_ctx, name);
    let record' = update(value(record), ["permissions"], Some(remove_permissions(record, json)));
    let record'' = update(record', ["secret"], Some(string("")));
    let obj = `O(get_dict(record''));
    State.replace(ctx.state_ctx, name, obj);
    let _ = Logger.info_f("revoke_container_permissions", to_string(obj));
    let arr = `A(get_list((x) => x, get_route(obj)));
    Ack.Payload(50,to_string(arr));
  } else {
    Ack.Code(129)
  };
};


let handle_post_grant_container_permissions = (ctx, prov, payload) => {
  switch (to_json(payload)) {
    | Some(json) => is_valid_container_permissions_data(ctx,json) ? grant_container_permissions(ctx,prov,json) : Ack.Code(128); 
    | None => Ack.Code(128); 
    };
};


let handle_post_revoke_container_permissions = (ctx, prov, payload) => {
  switch (to_json(payload)) {
    | Some(json) => is_valid_container_permissions_data(ctx,json) ? revoke_container_permissions(ctx,prov,json) : Ack.Code(128); 
    | None => Ack.Code(128); 
    };
};

let is_cm = (prov) => {
  Prov.token(prov) == token_secret_key^;
};

let handle_post = (ctx, prov, payload) => {
  let uri_path = Prov.uri_path(prov);
  let path_list = String.split_on_char('/', uri_path);
  switch path_list {
    | ["", "token"] => handle_post_token(ctx, prov, payload);
    | ["", "cm", "upsert-container-info"] when is_cm(prov) => handle_post_upsert_container_info(ctx, prov, payload);
    | ["", "cm", "delete-container-info"] when is_cm(prov) => handle_post_delete_container_info(ctx, prov, payload);
    | ["", "cm", "grant-container-permissions"] when is_cm(prov) => handle_post_grant_container_permissions(ctx, prov, payload);
    | ["", "cm", "revoke-container-permissions"] when is_cm(prov) => handle_post_revoke_container_permissions(ctx, prov, payload);
    | _ => Ack.Code(128); 
    };
};


let is_valid_uri_host = (ctx, uri_host, token) => {
  open Ezjsonm;
  if (State.exists(ctx.state_ctx, uri_host)) {
    let record = State.get(ctx.state_ctx, uri_host);
    let key = get_string(find(value(record), ["key"]));
    key == token;
  } else {
    false;
  }
};


let is_valid_token = (ctx, prov) => {
  let token = Prov.token(prov);
  let uri_host = Prov.uri_host(prov);
  switch token_secret_key^ {
  | "" => true
  | _ => (token == token_secret_key^) || (is_valid_uri_host(ctx,uri_host,token));
  };
};




let handle_expire = (ctx) =>
  Observe.expire(ctx.observe_ctx) >>= 
    (uuids) => route_message(uuids, ctx, Ack.Code(163), Protocol.Zest.create_ack(163), None);

let handle_route = (status, payload, ctx, prov) => {
  let key = Prov.ident(prov);
  if (Observe.is_observed(ctx.observe_ctx, key)) {
    route(status, payload, ctx, prov) >>=
      () => Lwt.return(status)
  } else {
    Lwt.return(status);
  }
};

let handle_msg = (msg, ctx) => {
  open Logger;
  handle_expire(ctx) >>= () => {
    Logger.debug_f("handle_msg", Printf.sprintf("Received:\n%s", to_hex(msg))) >>= () => {
      let r0 = Bitstring.bitstring_of_string(msg);
      let (tkl, oc, code, r1) = Protocol.Zest.handle_header(r0);
      let (token, r2) = Protocol.Zest.handle_token(r1, tkl);
      let (options, r3) = handle_options(oc, r2);
      let prov = Prov.create(~code=code, ~options=options, ~token=token);
      let payload = Bitstring.string_of_bitstring(r3);
      if (is_valid_token(ctx, prov)) {
        let status = switch code {
        | 1 => handle_get(ctx, prov);
        | 2 => handle_post(ctx, prov, payload);
        | _ => Ack.Code(128);
        };
        handle_route(status, payload, ctx, prov);
      } else {
        handle_route(Ack.Code(129), payload, ctx, prov);
      }
   }
  } 
};


let server = (ctx) => {
  open Logger;
  let rec loop = () =>
    Protocol.Zest.recv(ctx.zmq_ctx) >>= 
      (msg) => handle_msg(msg, ctx) >>= 
        (resp) => Protocol.Zest.send(ctx.zmq_ctx, ack(resp)) >>= 
          () => Logger.debug_f("server", Printf.sprintf("Sending:\n%s", to_hex(ack(resp)))) >>= 
            () => loop();
  Logger.info_f("server", "active") >>= (() => loop());
};


let cleanup_router = (ctx) => {
  Observe.get_all(ctx.observe_ctx) |> 
    (uuids) => route_message(uuids, ctx, Ack.Code(163), Protocol.Zest.create_ack(163), None) >>= 
      () => Lwt_unix.sleep(1.0)
};

let terminate_server = (ctx, m) => {
  Lwt_io.printf("\nShutting down server...\n") >>= 
    () => cleanup_router(ctx) >>= () => Protocol.Zest.close(ctx.zmq_ctx) |> (() => exit(0));
};



exception Interrupt(string);

let register_signal_handlers = () => {
  Lwt_unix.(
    on_signal(Sys.sigterm, (_) => raise(Interrupt("Caught SIGTERM"))) |> 
      (id) => on_signal(Sys.sighup, (_) => raise(Interrupt("Caught SIGHUP"))) |> 
        (id) => on_signal(Sys.sigint, (_) => raise(Interrupt("Caught SIGINT"))))
};

let rec run_server = (ctx) => {
  let _ =
    try (Lwt_main.run(server(ctx))) {
    | Interrupt(m) => terminate_server(ctx, m);
    | e => unhandled_error(e, ctx)
    };
  run_server(ctx);
};

let setup_server = () => {
  parse_cmdline();
  log_mode^ ? Logger.init () : ();
  setup_router_keys();
  set_server_key(server_secret_key_file^);
  set_token_key(token_secret_key_file^);
  databox^ ? enable_databox_mode () : ();
  let zmq_ctx =
    Protocol.Zest.create(
      ~endpoints=(rep_endpoint^, router_endpoint^),
      ~keys=(server_secret_key^, router_secret_key^)
    );
  let ctx = init(zmq_ctx);
  let _ = register_signal_handlers();  
  run_server(ctx) |> (() => terminate_server(ctx));
};

setup_server();
