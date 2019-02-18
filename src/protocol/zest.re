let router_public_key = ref("");

let router_secret_key = ref("");

type t = {
  zmq_ctx: ZMQ.Context.t,
  rep_soc: Lwt_zmq.Socket.t([ | `Rep]),
  router_soc: Lwt_zmq.Socket.t([ | `Router]),
  version: int
};


let get_option_value = (options, value) => {
  let rec find = (a, x, i) => {
    let (number, value) = a[i];
    if (number == x) {
      value;
    } else {
      find(a, x, i + 1);
    };
  };
  find(options, value, 0);
};

let get_uri_path = (options) => get_option_value(options, 11);

let get_uri_host = (options) => get_option_value(options, 3);

let get_max_age = (options) => {
  let value = get_option_value(options, 14);
  let bits = Bitstring.bitstring_of_string(value);
  let seconds = [%bitstring
    switch bits {
    | {|seconds : 32 : bigendian|} => seconds
    | {|_|} => failwith("invalid max-age value")
    }
  ];
  seconds;
};

let get_content_format = (options) => {
  let value = get_option_value(options, 12);
  let bits = Bitstring.bitstring_of_string(value);
  let id = [%bitstring
    switch bits {
    | {|id : 16 : bigendian|} => id
    | {|_|} => failwith("invalid content value")
    }
  ];
  id;
};


let get_observed = (options) => {
  let rec loop = (lis) =>
    switch lis {
    | [] => None
    | [(code,mode), ...rest] => code == 6 ? Some(mode) : loop(rest)
    };
  switch (loop(Array.to_list(options))) {
  | Some(("" | "data")) => "data"
  | Some(("audit")) => "audit"
  | _ => "none"
  };
};

let handle_option = (bits) => {
  let tuple = [%bitstring
    switch bits {
    | {|number : 16 : bigendian;
        len : 16 : bigendian;
        value: len*8: string;
        rest : -1 : bitstring
      |} => (
        number,
        value,
        rest
      )
    | {|_|} => failwith("invalid options")
    }
  ];
  tuple;
};


let handle_token = (bits, len) => {
  let tuple = [%bitstring
    switch bits {
    | {|token : len*8 : string;
        rest : -1 : bitstring
      |} => (token, rest)
    | {|_|} => failwith("invalid token")
    }
  ];
  tuple;
};

let handle_header = (bits) => {
  let tuple = [%bitstring
    switch bits {
    | {|code : 8 : unsigned;
        oc : 8 : unsigned;
        tkl : 16 : bigendian;
        rest : -1 : bitstring
     |} => (
        tkl,
        oc,
        code,
        rest
      )
    | {|_|} => failwith("invalid header")
    }
  ];
  tuple;
};

let create_header = (~tkl, ~oc, ~code) => {
  let bits = [%bitstring
    {|code : 8 : unsigned;
      oc : 8 : unsigned;
      tkl : 16 : bigendian
    |}
  ];
  (bits, 32);
};


let create_option = (~number, ~value) => {
  let byte_length = String.length(value);
  let bit_length = byte_length * 8;
  let bits = [%bitstring
    {|number : 16 : bigendian;
      byte_length : 16 : bigendian;
      value : bit_length : string
    |}
  ];
  (bits, bit_length + 32);
};

let create_options = (options) => {
  let count = Array.length(options);
  let values = Array.map(((x, y)) => x, options);
  let value = Bitstring.concat(Array.to_list(values));
  let lengths = Array.map(((x, y)) => y, options);
  let length = Array.fold_left((x, y) => x + y, 0, lengths);
  (value, length, count);
};

let create_content_format = (id) => {
  let bits = [%bitstring {|id : 16 : bigendian|}];
  Bitstring.string_of_bitstring(bits);
};

let create_ack_payload_options = (~format) => {
  let content_format = create_option(~number=12, ~value=format);
  create_options([|content_format|]);
};

let create_ack_payload = (format_code, payload) => {
  let (options_value, options_length, options_count) =
    create_ack_payload_options(~format=create_content_format(format_code));
  let (header_value, header_length) = create_header(~tkl=0, ~oc=options_count, ~code=69);
  let payload_bytes = String.length(payload) * 8;
  let bits = [%bitstring
    {|header_value : header_length : bitstring;
      options_value : options_length : bitstring;
      payload : payload_bytes : string
    |}
  ];
  Bitstring.string_of_bitstring(bits);
};

let create_ack_observe_options = (~format, ~key) => {
  let content_format = create_option(~number=12, ~value=format);
  let public_key = create_option(~number=2048, ~value=key);
  create_options([|content_format, public_key|]);
};

let create_ack_observe = (public_key, ~uuid as payload) => {
  let (options_value, options_length, options_count) =
    create_ack_observe_options(~format=create_content_format(0), ~key=public_key);
  let (header_value, header_length) = create_header(~tkl=0, ~oc=options_count, ~code=69);
  let payload_bytes = String.length(payload) * 8;
  let bits = [%bitstring
    {|header_value : header_length : bitstring;
      options_value : options_length : bitstring;
      payload : payload_bytes : string
    |}
  ];
  Bitstring.string_of_bitstring(bits);
};

let create_ack = (code) => {
  let (header_value, header_length) = create_header(~tkl=0, ~oc=0, ~code=code);
  let bits = [%bitstring {|header_value : header_length : bitstring|}];
  Bitstring.string_of_bitstring(bits);
};

let route = (ctx, ident, data) => {
  open Lwt_zmq.Socket.Router;
  send(ctx.router_soc, id_of_string(ident), [data]);
};

let send = (ctx, data) => Lwt_zmq.Socket.send(ctx.rep_soc, data);

let recv = (ctx) => Lwt_zmq.Socket.recv(ctx.rep_soc);

let close_socket = (lwt_soc) => {
  let soc = Lwt_zmq.Socket.to_socket(lwt_soc);
  ZMQ.Socket.close(soc);
};

let close = (ctx) => {
  close_socket(ctx.router_soc);
  close_socket(ctx.rep_soc);
  ZMQ.Context.terminate(ctx.zmq_ctx);
};

let setup_rep_socket = (endpoint, ctx, kind, secret) => {
  open ZMQ.Socket;
  let soc = ZMQ.Socket.create(ctx, kind);
  ZMQ.Socket.set_receive_high_water_mark(soc, 1);
  set_linger_period(soc, 0);
  set_curve_server(soc, true);
  set_curve_secretkey(soc, secret);
  bind(soc, endpoint);
  Lwt_zmq.Socket.of_socket(soc);
};

let setup_router_socket = (endpoint, ctx, kind, secret) => {
  open ZMQ.Socket;
  let soc = ZMQ.Socket.create(ctx, kind);
  ZMQ.Socket.set_receive_high_water_mark(soc, 1);
  set_linger_period(soc, 0);
  set_curve_server(soc, true);
  set_curve_secretkey(soc, secret);
  bind(soc, endpoint);
  Lwt_zmq.Socket.of_socket(soc);
};

let init = (ctx, rep_endpoint, router_endpoint, server_secret_key, router_secret_key) => {
  zmq_ctx: ctx,
  rep_soc: setup_rep_socket(rep_endpoint, ctx, ZMQ.Socket.rep, server_secret_key),
  router_soc: setup_router_socket(router_endpoint, ctx, ZMQ.Socket.router, router_secret_key),
  version: 1
};


let create = (~endpoints, ~keys) => {
  let (rep_endpoint, router_endpoint) = endpoints;
  let (server_secret_key, router_secret_key) = keys;
  let zmq_ctx = ZMQ.Context.create();
  init(zmq_ctx, rep_endpoint, router_endpoint, server_secret_key, router_secret_key);
};

