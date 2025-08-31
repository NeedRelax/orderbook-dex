/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/order_book_dex.json`.
 */
export type OrderBookDex = {
  "address": "6Kw1m5tG9E6Hh9TSzuofdCbjLLtjdRuQGFhiFDuZaJuL",
  "metadata": {
    "name": "orderBookDex",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "cancelLimitOrder",
      "discriminator": [
        132,
        156,
        132,
        31,
        67,
        40,
        232,
        97
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "bids",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market.base_mint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quote_mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "asks",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  107,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market.base_mint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quote_mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "openOrders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  110,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "openOrders"
          ]
        }
      ],
      "args": [
        {
          "name": "orderId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closeOpenOrders",
      "discriminator": [
        200,
        216,
        63,
        239,
        7,
        230,
        255,
        20
      ],
      "accounts": [
        {
          "name": "openOrders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  110,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "openOrders"
          ]
        },
        {
          "name": "solDestination",
          "writable": true
        },
        {
          "name": "market"
        }
      ],
      "args": []
    },
    {
      "name": "initializeMarket",
      "discriminator": [
        35,
        35,
        189,
        193,
        155,
        48,
        170,
        203
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "baseMint"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ]
          }
        },
        {
          "name": "baseMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "baseVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "feeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "baseMint"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ]
          }
        },
        {
          "name": "bids",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "baseMint"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ]
          }
        },
        {
          "name": "asks",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  107,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "baseMint"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "makerFeeBps",
          "type": "u16"
        },
        {
          "name": "takerFeeBps",
          "type": "u16"
        },
        {
          "name": "tickSize",
          "type": "u64"
        },
        {
          "name": "baseLotSize",
          "type": "u64"
        },
        {
          "name": "minBaseQty",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "minNotional",
          "type": {
            "option": "u64"
          }
        }
      ]
    },
    {
      "name": "matchOrders",
      "discriminator": [
        17,
        1,
        201,
        93,
        7,
        51,
        251,
        134
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "bids",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market.base_mint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quote_mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "asks",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  107,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market.base_mint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quote_mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "feeVault",
          "writable": true
        },
        {
          "name": "baseMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "matchLimit",
          "type": "u64"
        }
      ]
    },
    {
      "name": "newLimitOrder",
      "discriminator": [
        129,
        116,
        182,
        60,
        107,
        108,
        173,
        127
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "bids",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market.base_mint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quote_mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "asks",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  107,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market.base_mint",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.quote_mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "openOrders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  110,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "baseVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "userBaseTokenAccount",
          "writable": true
        },
        {
          "name": "userQuoteTokenAccount",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "baseMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "quantity",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setFees",
      "discriminator": [
        137,
        178,
        49,
        58,
        0,
        245,
        242,
        190
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "makerFeeBps",
          "type": "u16"
        },
        {
          "name": "takerFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "setPause",
      "discriminator": [
        63,
        32,
        154,
        2,
        56,
        103,
        79,
        45
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settleFunds",
      "discriminator": [
        238,
        64,
        163,
        96,
        75,
        171,
        16,
        33
      ],
      "accounts": [
        {
          "name": "market"
        },
        {
          "name": "openOrders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  110,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "openOrders"
          ]
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userBaseTokenAccount",
          "writable": true
        },
        {
          "name": "userQuoteTokenAccount",
          "writable": true
        },
        {
          "name": "baseMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "openOrders",
      "discriminator": [
        139,
        166,
        123,
        206,
        111,
        2,
        116,
        33
      ]
    },
    {
      "name": "orderBook",
      "discriminator": [
        55,
        230,
        125,
        218,
        149,
        39,
        65,
        248
      ]
    }
  ],
  "events": [
    {
      "name": "feeCollectedEvent",
      "discriminator": [
        142,
        253,
        94,
        133,
        187,
        191,
        46,
        40
      ]
    },
    {
      "name": "feesUpdatedEvent",
      "discriminator": [
        132,
        181,
        254,
        193,
        136,
        177,
        41,
        20
      ]
    },
    {
      "name": "marketInitializedEvent",
      "discriminator": [
        70,
        173,
        96,
        202,
        100,
        143,
        45,
        25
      ]
    },
    {
      "name": "orderCancelledEvent",
      "discriminator": [
        200,
        73,
        179,
        145,
        247,
        176,
        10,
        101
      ]
    },
    {
      "name": "orderPlacedEvent",
      "discriminator": [
        245,
        198,
        202,
        247,
        110,
        231,
        254,
        156
      ]
    },
    {
      "name": "pauseEvent",
      "discriminator": [
        32,
        51,
        61,
        169,
        156,
        104,
        130,
        43
      ]
    },
    {
      "name": "tradeEvent",
      "discriminator": [
        189,
        219,
        127,
        211,
        78,
        230,
        97,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "orderBookFull",
      "msg": "The order book is full."
    },
    {
      "code": 6001,
      "name": "orderNotFound",
      "msg": "Order not found."
    },
    {
      "code": 6002,
      "name": "nodeNotFound",
      "msg": "Node not found in slab."
    },
    {
      "code": 6003,
      "name": "unauthorized",
      "msg": "Unauthorized action."
    },
    {
      "code": 6004,
      "name": "invalidOrderInput",
      "msg": "Order input is invalid."
    },
    {
      "code": 6005,
      "name": "orderWouldCross",
      "msg": "Order would cross the spread, violating PostOnly."
    },
    {
      "code": 6006,
      "name": "selfTradeForbidden",
      "msg": "Self-trading is forbidden."
    },
    {
      "code": 6007,
      "name": "mathOverflow",
      "msg": "An arithmetic operation overflowed."
    },
    {
      "code": 6008,
      "name": "invalidFee",
      "msg": "Fee bps value is invalid."
    },
    {
      "code": 6009,
      "name": "orderBookEmpty",
      "msg": "Order book is empty."
    },
    {
      "code": 6010,
      "name": "invalidMakerAccount",
      "msg": "Invalid maker account provided."
    },
    {
      "code": 6011,
      "name": "paused",
      "msg": "Market is paused."
    },
    {
      "code": 6012,
      "name": "invalidTickSize",
      "msg": "Invalid tick size."
    },
    {
      "code": 6013,
      "name": "invalidLotSize",
      "msg": "Invalid base lot size."
    },
    {
      "code": 6014,
      "name": "belowMinBaseQty",
      "msg": "Below minimal base quantity."
    },
    {
      "code": 6015,
      "name": "belowMinNotional",
      "msg": "Below minimal notional"
    },
    {
      "code": 6016,
      "name": "invalidMint",
      "msg": "Invalid mint account."
    },
    {
      "code": 6017,
      "name": "invalidVault",
      "msg": "Invalid vault account."
    },
    {
      "code": 6018,
      "name": "invalidMarketParams",
      "msg": "Invalid market config params."
    },
    {
      "code": 6019,
      "name": "openOrdersFull",
      "msg": "This user's OpenOrders account is full."
    },
    {
      "code": 6020,
      "name": "orderNotFoundInOpenOrders",
      "msg": "Order ID not found in the user's OpenOrders account."
    },
    {
      "code": 6021,
      "name": "openOrdersAccountNotEmpty",
      "msg": "Cannot close an OpenOrders account that still holds funds or has open orders."
    }
  ],
  "types": [
    {
      "name": "feeCollectedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "feesUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "makerFeeBps",
            "type": "u16"
          },
          {
            "name": "takerFeeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "market",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "baseVault",
            "type": "pubkey"
          },
          {
            "name": "quoteVault",
            "type": "pubkey"
          },
          {
            "name": "feeVault",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bids",
            "type": "pubkey"
          },
          {
            "name": "asks",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "orderSequenceNumber",
            "type": "u64"
          },
          {
            "name": "makerFeeBps",
            "type": "u16"
          },
          {
            "name": "takerFeeBps",
            "type": "u16"
          },
          {
            "name": "baseDecimals",
            "type": "u8"
          },
          {
            "name": "quoteDecimals",
            "type": "u8"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "tickSize",
            "type": "u64"
          },
          {
            "name": "baseLotSize",
            "type": "u64"
          },
          {
            "name": "minBaseQty",
            "type": "u64"
          },
          {
            "name": "minNotional",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "marketInitializedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "makerFeeBps",
            "type": "u16"
          },
          {
            "name": "takerFeeBps",
            "type": "u16"
          },
          {
            "name": "tickSize",
            "type": "u64"
          },
          {
            "name": "baseLotSize",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "nodeTag",
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "uninitialized"
          },
          {
            "name": "freeNode"
          },
          {
            "name": "orderNode"
          }
        ]
      }
    },
    {
      "name": "openOrders",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "baseTokenFree",
            "type": "u64"
          },
          {
            "name": "quoteTokenFree",
            "type": "u64"
          },
          {
            "name": "baseTokenLocked",
            "type": "u64"
          },
          {
            "name": "quoteTokenLocked",
            "type": "u64"
          },
          {
            "name": "orderIds",
            "type": {
              "array": [
                "u64",
                16
              ]
            }
          },
          {
            "name": "isInitialized",
            "type": {
              "array": [
                "bool",
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "order",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ownerAccount",
            "type": "pubkey"
          },
          {
            "name": "orderId",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "baseQty",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "orderBook",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "isBids",
            "type": {
              "defined": {
                "name": "podBool"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "padding1",
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          },
          {
            "name": "head",
            "type": "u32"
          },
          {
            "name": "tail",
            "type": "u32"
          },
          {
            "name": "freeListHead",
            "type": "u32"
          },
          {
            "name": "count",
            "type": "u32"
          },
          {
            "name": "padding2",
            "type": {
              "array": [
                "u8",
                4
              ]
            }
          },
          {
            "name": "nodes",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "orderNode"
                  }
                },
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "orderCancelledEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "orderId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "orderNode",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": {
              "defined": {
                "name": "order"
              }
            }
          },
          {
            "name": "next",
            "type": "u32"
          },
          {
            "name": "prev",
            "type": "u32"
          },
          {
            "name": "tag",
            "type": {
              "defined": {
                "name": "nodeTag"
              }
            }
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          }
        ]
      }
    },
    {
      "name": "orderPlacedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "orderId",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "quantity",
            "type": "u64"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          }
        ]
      }
    },
    {
      "name": "pauseEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "podBool",
      "repr": {
        "kind": "transparent"
      },
      "type": {
        "kind": "struct",
        "fields": [
          "u8"
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "bid"
          },
          {
            "name": "ask"
          }
        ]
      }
    },
    {
      "name": "tradeEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "makerBid",
            "type": "pubkey"
          },
          {
            "name": "makerAsk",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "quantity",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
