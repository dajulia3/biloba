// Original file: ../protocol/biloba/v1/driver.proto


export interface Cookie {
  'name'?: (string);
  'value'?: (string);
  'domain'?: (string);
  'path'?: (string);
  'secure'?: (boolean);
  'httpOnly'?: (boolean);
  'expiresUnix'?: (number | string);
  'sameSite'?: (string);
}

export interface Cookie__Output {
  'name'?: (string);
  'value'?: (string);
  'domain'?: (string);
  'path'?: (string);
  'secure'?: (boolean);
  'httpOnly'?: (boolean);
  'expiresUnix'?: (number);
  'sameSite'?: (string);
}
