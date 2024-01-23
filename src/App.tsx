import './App.css'
import { useState, useEffect, useRef } from 'react'
import { formatBalance, formatChainInDecimalAsString } from './utils'
import { ethers } from "ethers";
import NFTMarketABI from "./utils/NFTMarketABI.json"
import ERC777TokenGTTABI from "./utils/ERC777TokenGTTABI.json"
import ERC721TokenABI from "./utils/ERC721Token.json"

interface WalletState { accounts: string[], signer: ethers.JsonRpcSigner | null, chainId: string, balance: number | string }
interface NFTListStatus {
  [NFTAddress: string]: number[];
}
let GTTAddress: string = ""
let NFTMarketAddress: string = ""
let GTTContract: ethers.Contract
let NFTMarket: ethers.Contract
let ERC721TokenContract: ethers.Contract
let scanURL: string = ''
let TxURL_List: string | null = null
let TxURL_Delist: string | null = null
let TxURL_Buy: string | null = null
// let ListedNFT: NFTListStatus = {}
const initialState = { accounts: [], signer: null, balance: "", chainId: "" }
const App = () => {
  const [ListedNFT, setListedNFT] = useState<NFTListStatus>({});
  const [wallet, setWallet] = useState<WalletState>(initialState)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isNFTMarketApproved, setisNFTMarketApproved] = useState(true)
  const [error, setError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [GTTBalance, setGTTBalance] = useState<number | string>("");
  const NFTAddressRef_List = useRef<HTMLInputElement>(null);
  const tokenIdRef_List = useRef<HTMLInputElement>(null);
  const NFTPriceRef_List = useRef<HTMLInputElement>(null);
  const NFTAddressRef_Delist = useRef<HTMLInputElement>(null);
  const tokenIdRef_Delist = useRef<HTMLInputElement>(null);
  const NFTAddressRef_Buy = useRef<HTMLInputElement>(null);
  const tokenIdRef_Buy = useRef<HTMLInputElement>(null);
  const bidValueRef_Buy = useRef<HTMLInputElement>(null);
  const disableConnect = Boolean(wallet) && isConnecting

  useEffect(() => {
    let provider: ethers.BrowserProvider
    const refreshAccounts = async () => {
      const accounts = await _updateAccounts()
      _updateState(accounts)
    }

    const refreshChain = async (rawChainId: any) => {
      const chainId = formatChainInDecimalAsString(rawChainId)
      const accounts = await _updateAccounts()
      const balance = await _updateBalance(accounts)
      setWallet((wallet) => ({ ...wallet, balance, chainId }))
      _updateInfoOfChain(chainId)
      _updateContract()
      await _updateTokenBalance(accounts)
    }

    const initialization = async () => {
      provider = new ethers.BrowserProvider(window.ethereum)
      if (provider) {
        if (wallet.accounts.length > 0) {
          refreshAccounts()
        } else {
          setWallet(initialState)
        }

        window.ethereum.on('accountsChanged', refreshAccounts)
        window.ethereum.on("chainChanged", refreshChain)
      }
    }

    initialization()

    return () => {
      window.ethereum?.removeListener('accountsChanged', refreshAccounts)
      window.ethereum?.removeListener("chainChanged", refreshChain)
    }
  }, [])

  const handleNFTMarket_List = async () => {
    const NFTAddress = NFTAddressRef_List.current?.value;
    const tokenId = tokenIdRef_List.current?.value;
    const NFTPrice = NFTPriceRef_List.current?.value;
    const isApproved = await NFTMarket.CheckIfApprovedByNFT(NFTAddress, tokenId);
    const ownerOfNFT = await NFTMarket.getOwner(NFTAddress, tokenId);
    try {
      if (ownerOfNFT == NFTMarketAddress) {
        setError(true)
        setErrorMessage("This NFT has already listed in this NFTMarket")
        if (NFTAddress && tokenId) {
          const tokenIdNum = parseInt(tokenId);
          setListedNFT(prevListedNFT => {
            const updatedList = { ...prevListedNFT };
            if (!updatedList[NFTAddress]) {
              updatedList[NFTAddress] = [];
            }
            updatedList[NFTAddress].push(tokenIdNum);
            return updatedList;
          });
        }
        setError(false)
        return
      }
      if (!isApproved) {
        setError(true)
        setErrorMessage("Before listing NFT, this NFTMarket should be approved by corresponding NFT in advance")
        setisNFTMarketApproved(false)
        return
      }
      let tx = await NFTMarket.list(NFTAddress, tokenId, NFTPrice)
      TxURL_List = scanURL + 'tx/' + tx.hash
      const receipt = await tx.wait()
      _updateStateAfterTx(receipt)
      if (receipt) {
        if (NFTAddress && tokenId) {
          const tokenIdNum = parseInt(tokenId);
          setListedNFT(prevListedNFT => {
            const updatedList = { ...prevListedNFT };
            if (!updatedList[NFTAddress]) {
              updatedList[NFTAddress] = [];
            }
            updatedList[NFTAddress].push(tokenIdNum);
            return updatedList;
          });
        }
      }
      setError(false)
    } catch (err: any) {
      setError(true)
      setErrorMessage(err.message)
    }
  }

  const handleNFTMarket_Delist = async () => {
    const NFTAddress = NFTAddressRef_Delist.current?.value;
    const tokenId = tokenIdRef_Delist.current?.value;
    const ownerOfNFT = await NFTMarket.getOwner(NFTAddress, tokenId);
    try {
      if (ownerOfNFT != NFTMarketAddress) {
        setError(true)
        setErrorMessage("This NFT is not listed in this NFTMarket")
        return
      }
      let tx = await NFTMarket.delist(NFTAddress, tokenId)
      const receipt = await tx.wait()
      _updateStateAfterTx(receipt)
      if (receipt) {
        if (NFTAddress && tokenId) {
          const tokenIdNum = parseInt(tokenId);
          if (ListedNFT[NFTAddress]) {
            const updatedTokenIds = ListedNFT[NFTAddress].filter(id => id !== tokenIdNum);
            if (updatedTokenIds.length === 0) {
              const updatedListedNFT = { ...ListedNFT };
              delete updatedListedNFT[NFTAddress];
              setListedNFT(updatedListedNFT);
            } else {
              setListedNFT({ ...ListedNFT, [NFTAddress]: updatedTokenIds });
            }
          }
        }
      }
      TxURL_Delist = scanURL + 'tx/' + tx.hash
      console.log(`TxURL_Delist@handleNFTMarket_Delist: ${TxURL_Delist}`)
      setError(false)
    } catch (err: any) {
      setError(true)
      setErrorMessage(err.message)
    }
  }

  const handleNFTMarket_Buy = async () => {
    const NFTAddress = NFTAddressRef_Buy.current?.value;
    const tokenId = tokenIdRef_Buy.current?.value;
    const bidValue = bidValueRef_Buy.current?.value;
    const ownerOfNFT = await NFTMarket.getOwner(NFTAddress, tokenId);
    try {
      if (ownerOfNFT != NFTMarketAddress) {
        setError(true)
        setErrorMessage("This NFT has not listed in this NFTMarket")
        return
      }
      let tx = await NFTMarket.buy(NFTAddress, tokenId, bidValue)
      TxURL_Buy = scanURL + 'tx/' + tx.hash
      const receipt = await tx.wait()
      _updateStateAfterTx(receipt)
      setError(false)
    } catch (err: any) {
      setError(true)
      setErrorMessage(err.message)
    }
  }

  const handleNFT_Approve = async () => {
    let provider = new ethers.BrowserProvider(window.ethereum)
    let signer = await provider.getSigner()
    const NFTAddress = NFTAddressRef_List.current?.value;
    const tokenId = tokenIdRef_List.current?.value;
    if (NFTAddress) {
      ERC721TokenContract = new ethers.Contract(NFTAddress, ERC721TokenABI, signer)
    }
    const tx = await ERC721TokenContract.approve(NFTMarketAddress, tokenId)
    const receipt = await tx.wait()
    _updateStateAfterTx(receipt)
    if (receipt) {
      setisNFTMarketApproved(true)
    }
    setError(false)
  }

  const _updateStateAfterTx = (receipt: any) => {
    if (receipt) {
      _updateBalance(wallet.accounts)
      _updateTokenBalance(wallet.accounts)
    }
  }

  const _updateInfoOfChain = (chainId: string) => {
    switch (chainId) {
      // Mumbai
      case '80001':
        GTTAddress = "0xDBaA831fc0Ff91FF67A3eD5C6c708E6854CE6EfF"
        NFTMarketAddress = "0xF0B5972a88F201B1a83d87a1de2a6569d66fac58"
        scanURL = 'https://mumbai.polygonscan.com/'
        break;
      // Ethereum Goerli
      case '5':
        GTTAddress = "0x6307230425563aA7D0000213f579516159CDf84a"
        NFTMarketAddress = "0xAFD443aF73e81BFBA794124083b4C71aEbdC25BF"
        scanURL = 'https://goerli.etherscan.io/'
        break;
      default:
        GTTAddress = ""
        NFTMarketAddress = ""
    }
  }

  const _updateState = async (accounts: any) => {
    const chainId = await _updateChainId()
    const balance = await _updateBalance(accounts)
    let provider = new ethers.BrowserProvider(window.ethereum)
    let signer = await provider.getSigner()
    if (accounts.length > 0) {
      setWallet({ ...wallet, accounts, chainId, signer, balance })
    } else {
      setWallet(initialState)
    }
    _updateInfoOfChain(chainId)
    await _updateContract()
    await _updateTokenBalance(accounts)
  }

  const _updateContract = async () => {
    let provider = new ethers.BrowserProvider(window.ethereum)
    let signer = await provider.getSigner()
    NFTMarket = new ethers.Contract(NFTMarketAddress, NFTMarketABI, signer)
    GTTContract = new ethers.Contract(GTTAddress, ERC777TokenGTTABI, signer)
  }

  const _updateBalance = async (accounts: any) => {
    const balance = formatBalance(await window.ethereum!.request({
      method: "eth_getBalance",
      params: [accounts[0], "latest"],
    }))
    return balance
  }

  const _updateTokenBalance = async (accounts: any) => {
    setGTTBalance(formatBalance(await GTTContract.balanceOf(accounts[0])))
  }

  const _updateAccounts = async () => {
    const accounts = await window.ethereum.request(
      { method: 'eth_accounts' }
    )
    return accounts
  }

  const _updateChainId = async () => {
    const chainId = formatChainInDecimalAsString(await window.ethereum!.request({
      method: "eth_chainId",
    }))
    setWallet({ ...wallet, chainId })
    return chainId
  }

  const getLogs = async (fromBlock: number, toBlock: number) => {
    // const userAddress = wallet.accounts[0]
    let filter = {
      fromBlock, toBlock,
      address: NFTMarketAddress,
    }
    let provider = new ethers.BrowserProvider(window.ethereum)
    let currentBlock = await provider.getBlockNumber()
    if (filter.toBlock > currentBlock) {
      filter.toBlock = currentBlock;
    }
    provider.getLogs(filter).then(logs => {
      console.log(fromBlock,toBlock,logs.length);
      if (logs.length > 0) decodeEvents(logs)
      if (currentBlock <= fromBlock && logs.length == 0) {
        console.log("begin monitor")
        // 方式1，继续轮训
        // setTimeout(() => {
        //     getLogs(fromBlock, toBlock)
        // }, 2000);
        // 方式2: 监听
        NFTMarket.on("NFTListed", function (a0, a1, a2, event) {

          decodeEvents([event.log])
        })
        NFTMarket.on("NFTDelisted", function (a0, a1, event) {
          decodeEvents([event.log])
        })
        NFTMarket.on("NFTBought", function (a0, a1, a2, event) {
          decodeEvents([event.log])
        })
      } else {
        getLogs(toBlock + 1, toBlock + 1 + 200)
      }
    })
  }

  function decodeEvents(logs: any) {
    const event_NFTListed = NFTMarket.getEvent("NFTListed").fragment
    const event_NFTDelisted = NFTMarket.getEvent("NFTDelisted").fragment
    const event_NFTBought = NFTMarket.getEvent("NFTBought").fragment

    for (var i = 0; i < logs.length; i++) {
      const item = logs[i]
      const eventId = item.topics[0]
      if (eventId == event_NFTListed.topicHash) {
        const data = NFTMarket.interface.decodeEventLog(event_NFTListed, item.data, item.topics)
        printLog(`NFTListed@Block#${item.blockNumber} | Parameters: { NFTAddress: ${data.NFTAddr}, tokenId: ${data.tokenId}, price: ${data.price} } (${item.transactionHash})`)
      } else if (eventId == event_NFTDelisted.topicHash) {
        const data = NFTMarket.interface.decodeEventLog(event_NFTDelisted, item.data, item.topics)
        printLog(`NFTDelisted@Block#${item.blockNumber} | Parameters: { NFTAddress:${data.NFTAddr}, tokenId: ${data.tokenId} } (${item.transactionHash})`)
      } if (eventId == event_NFTBought.topicHash) {
        const data = NFTMarket.interface.decodeEventLog(event_NFTBought, item.data, item.topics)
        printLog(`NFTBought@Block#${item.blockNumber} | Parameters: { NFTAddress:${data.NFTAddr}, tokenId: ${data.tokenId}, bidValue: ${data.bidValue} } (${item.transactionHash})`)
      }
    }
  }

  function printLog(msg: any) {
    let p = document.createElement("p");
    p.textContent = msg
    document.getElementsByClassName("logs")[0].appendChild(p)
  }

  const openTxUrl_List = () => {
    if (TxURL_List)
      window.open(TxURL_List, '_blank');
  };
  const openTxUrl_Deist = () => {
    if (TxURL_Delist)
      window.open(TxURL_Delist, '_blank');
  };
  const openTxUrl_Buy = () => {
    if (TxURL_Buy)
      window.open(TxURL_Buy, '_blank');
  };

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      const accounts: [] = await window.ethereum.request({
        method: "eth_requestAccounts",
      })
      let startBlockNumber = 45068820
      getLogs(startBlockNumber, startBlockNumber + 200)
      _updateState(accounts)
      setError(false)
    } catch (err: any) {
      setError(true)
      setErrorMessage(err.message)
    }
    setIsConnecting(false)
  }

  return (
    <div className="App">
      <h2>Garen NFTMarket</h2>
      <div>{window.ethereum?.isMetaMask && wallet.accounts.length < 1 &&
        <button disabled={disableConnect} style={{ fontSize: '22px' }} onClick={handleConnect}>Connect MetaMask</button>
      }</div>
      <div className="info-container" >
        {wallet.accounts.length > 0 &&
          <>
            <div>Wallet Accounts: {wallet.accounts[0]}</div>
            <div>Wallet Balance: {wallet.balance}</div>
            <div>ChainId: {wallet.chainId}</div>
            <div>Token(GTT) Balance: {GTTBalance} GTT</div>
          </>
        }
        {error && (
          <div style={{ fontSize: '18px', color: 'red' }} onClick={() => setError(false)}>
            <strong>Error:</strong> {errorMessage}
          </div>
        )
        }
      </div>
      <div className='InteractionArea'>
        {wallet.accounts.length > 0 && (
          <div className="left-container">
            {window.ethereum?.isMetaMask && wallet.accounts.length > 0 &&
              <>
                <label>NFT Address:</label>
                <input ref={NFTAddressRef_List} placeholder="Input NFT contract address" type="text" />
                <label>tokenId:</label>
                <input ref={tokenIdRef_List} placeholder="Input tokenId of NFT" type="text" />
                <label>price:</label>
                <input ref={NFTPriceRef_List} placeholder="Input theh price of listed NFT" type="text" />
                <button onClick={handleNFTMarket_List}>List NFT</button>
              </>
            }
            {
              isNFTMarketApproved == false &&
              <button style={{ fontSize: '14px' }} onClick={handleNFT_Approve}>Approve NFTMarket</button>
            }
            {TxURL_List != null &&
              <>
                <button id="TxOfList" v-show="TxURL_List" onClick={() => openTxUrl_List()}> Transaction </button>
              </>
            }
            <br />
            {window.ethereum?.isMetaMask && wallet.accounts.length > 0 &&
              <>
                <label>NFT Address:</label>
                <input ref={NFTAddressRef_Delist} placeholder="Input NFT contract address" type="text" />
                <label>tokenId:</label>
                <input ref={tokenIdRef_Delist} placeholder="Input tokenId of NFT" type="text" />
                <button onClick={handleNFTMarket_Delist}>Delist NFT</button>
              </>
            }
            {TxURL_Delist != null &&
              <>
                <button id="TxOfDelist" v-show="TxURL_Delist" onClick={() => openTxUrl_Deist()}> Transaction </button>
              </>
            }
            <br />
            {window.ethereum?.isMetaMask && wallet.accounts.length > 0 &&
              <>
                <label>NFT Address:</label>
                <input ref={NFTAddressRef_Buy} placeholder="Input NFT contract address" type="text" />
                <label>tokenId:</label>
                <input ref={tokenIdRef_Buy} placeholder="Input tokenId of NFT" type="text" />
                <label>bidValue:</label>
                <input ref={bidValueRef_Buy} placeholder="Input value of bidding" type="text" />
                <button onClick={handleNFTMarket_Buy}>Buy NFT</button>
              </>
            }
            {TxURL_Buy != null &&
              <>
                <button id="TxOfBuy" v-show="TxURL_Buy" onClick={() => openTxUrl_Buy()}> Transaction </button>
              </>
            }
          </div>
        )}
        {wallet.accounts.length > 0 && (
          <div className='right-container'>
            <h3>Listed NFTs : </h3>
            {Object.keys(ListedNFT).map((address) => (
              <div key={address}>
                <h4>{address}</h4>
                <ul>
                  {ListedNFT[address].map((tokenId) => (
                    <li key={tokenId}>Token ID: {tokenId}</li>
                  ))}
                </ul>
              </div>
            ))}
            <h4 style={{ fontSize: '20px', color: 'gray', marginBottom: "3px" }}>Logs : </h4>
            {
              wallet.accounts.length > 0 && (
                <div className='logs' style={{ fontSize: '15px', color: 'gray' }}></div>
              )
            }
          </div>
        )}
      </div>

    </div>
  )
}

export default App