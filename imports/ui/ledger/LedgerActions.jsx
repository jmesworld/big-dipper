/* eslint-disable react/jsx-no-comment-textnodes */
/* eslint-disable react/no-unused-prop-types */
import qs from 'querystring';
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner, TabContent, TabPane, Row, Col, Modal, ModalBody, ModalFooter, InputGroup, InputGroupAddon, Input, Progress,
    UncontrolledTooltip, UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem} from 'reactstrap';
import { Ledger, DEFAULT_MEMO } from './ledger.js';
import { Validators } from '/imports/api/validators/validators.js';
import AccountTooltip from '/imports/ui/components/AccountTooltip.jsx';
import Coin from '/both/utils/coins.js';
import numbro from 'numbro';
import TimeStamp from '../components/TimeStamp.jsx';
import { PropTypes } from 'prop-types';
import { assertIsDeliverTxSuccess, SigningStargateClient, defaultRegistryTypes } from "@cosmjs/stargate";
import {Registry} from "@cosmjs/proto-signing";
import {MsgSubmitProposal, MsgDeposit, MsgVote, MsgVoteWeighted} from "../../../cosmos/codec/gov/v1beta1/tx";
import BigNumber from 'bignumber.js';
import { cutFractions, cutTrailingZeroes, separateDecimals, separateFractions } from '../../../both/utils/regex-formatting.js';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import TableFooter from '@mui/material/TableFooter';
import Tooltip from "react-simple-tooltip";
import { GasPrice } from "@cosmjs/launchpad";
import amino from "@cosmjs/amino";
import math from "@cosmjs/math";


const maxHeightModifier = {
    setMaxHeight: {
        enabled: true,
        fn: (data) => {
            return {...data, styles: {...data.styles, 'overflowY': 'auto', maxHeight: '80vh'}};
        }
    }
}

const Types = {
    DELEGATE: 'delegate',
    REDELEGATE: 'redelegate',
    UNDELEGATE: 'undelegate',
    WITHDRAW: 'withdraw',
    SEND: 'send',
    MULTISEND: 'multiSend',
    SUBMITPROPOSAL: 'submitProposal',
    VOTE: 'vote',
    WEIGHTEDVOTE: 'weightedVote',
    DEPOSIT: 'deposit'
}

const DEFAULT_GAS_ADJUSTMENT = '1.4';

const durationToDay = 1/60/60/24/10e8;

const TypeMeta = {
    [Types.DELEGATE]: {
        button: 'delegate',
        pathPreFix: 'staking/delegators',
        pathSuffix: 'delegations',
        warning: ''
    },
    [Types.REDELEGATE]: {
        button: 'redelegate',
        pathPreFix: 'staking/delegators',
        pathSuffix: 'redelegations',
        warning: (duration, maxEntries) => {
            let day = duration*durationToDay;
            return `You are only able to redelegate from Validator A to Validator B
                  up to ${maxEntries} times in a ${day} day period.
                  Also, There is ${day} day cooldown from serial redelegation;
                  Once you redelegate from Validator A to Validator B,
                  you will not be able to redelegate from Validator B to another
                  validator for the next ${day} days.`
        }
    },
    [Types.UNDELEGATE]: {
        button: 'undelegate',
        pathPreFix: 'staking/delegators',
        pathSuffix: 'unbonding_delegations',
        warning: (duration) => `There is a ${duration*durationToDay}-day unbonding period.`
    },
    [Types.WITHDRAW]: {
        button: 'withdraw',
        pathPreFix: 'distribution/delegators',
        pathSuffix: 'rewards',
        warning: '',
        gasAdjustment: '1.6'
    },
    [Types.SEND]: {
        button: 'single transfer',
        button_other: 'send',
        pathPreFix: 'bank/accounts',
        pathSuffix: 'transfers',
        warning: '',
        gasAdjustment: '1.8'
    },
    [Types.MULTISEND]: {
        button: 'multi send',
        button_other: 'send',
        pathPreFix: 'bank/accounts',
        pathSuffix: 'transfers',
        warning: '',
        gasAdjustment: '1.8'
    },
    [Types.SUBMITPROPOSAL]: {
        button: 'new proposal',
        path: 'gov/proposals',
        gasAdjustment: '1.4'
    },
    [Types.VOTE]: {
        button: 'vote',
        pathPreFix: 'gov/proposals',
        pathSuffix: 'votes',
        gasAdjustment: '2.5'
    },
    [Types.WEIGHTEDVOTE]: {
        button: 'weighted vote',
        pathPreFix: 'gov/proposals',
        pathSuffix: 'votes',
        gasAdjustment: '2.5'
    },
    [Types.DEPOSIT]: {
        button: 'deposit',
        pathPreFix: 'gov/proposals',
        pathSuffix: 'deposits',
        gasAdjustment: '2'
    }
}

const CoinAmount = (props) => {
    let coin = {};

    if (!props.coin && !props.amount) return null;

    if(!props.denom){
        coin = new Coin(props.amount).toString(4);
    }
    else{
        let denomFinder =  Meteor.settings.public.coins.find(({ denom }) => denom === props.denom);
        let displayDenom = denomFinder ? denomFinder.displayName : null;
        
        let finder = props.amount.find(({ denom }) => denom === props.denom)
        coin = finder ? new Coin(finder.amount, finder.denom).toString(4) : '0.0000 ' + displayDenom;
    }
    let denom = (props.mint)?Coin.StakingCoin.denom:Coin.StakingCoin.displayName;

    return <span><span className={props.className || 'coin'}>{coin}</span> </span>
}


const Amount = (props) => {
    if (!props.coin && !props.amount) return null;
    let coin = props.coin || new Coin(props.amount, props.denom).toString(4);
    let amount = (props.mint)?Math.round(coin.amount):coin.stakingAmount;
    let denom = (props.mint)?Coin.StakingCoin.denom:Coin.StakingCoin.displayName;
    return <span><span className={props.className || 'amount'}>{separateDecimals(amount.valueOf())}</span> <span className='denom'>{denom}</span></span>
}

const Fee = (props) => {
    
    return <span><CoinAmount mint className='gas' amount={Math.ceil(props.gas * Meteor.settings.public.ledger.gasPrice)}/> as fee </span>
}

const isActiveValidator = (validator) => {
    return !validator.jailed && validator.status == 'BOND_STATUS_BONDED';
}

const isBetween = (value, min, max) => {
    if (value instanceof Coin) value = value.amount;
    if (min instanceof Coin) min = min.amount;
    if (max instanceof Coin) max = max.amount;

    if ((value instanceof BigNumber) === false) {
        value = new BigNumber(value);
    }

    if ((min instanceof BigNumber) === false) {
        min = new BigNumber(min);
    }

    if ((max instanceof BigNumber) === false) {
        max = new BigNumber(max);
    }

    return value.comparedTo(min) >= 0 && value.comparedTo(max) <= 0
}

const startsWith = (str, prefix) => {
    return str.substr(0, prefix.length) === prefix
}

const isAddress = (address) => {
    return address && startsWith(address, Meteor.settings.public.bech32PrefixAccAddr)
}

const isValidatorAddress = (address) => {
    return address && startsWith(address, Meteor.settings.public.bech32PrefixValAddr)
}

class LedgerButton extends Component {
    constructor(props) {
        super(props);
        this.state = {
            multisendRows: [{},{}],
            activeTab: '2',
            errorMessage: '',
            user: localStorage.getItem(CURRENTUSERADDR),
            pubKey: localStorage.getItem(CURRENTUSERPUBKEY),
            memo: DEFAULT_MEMO,
            proposalType: Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_TEXT,
            validator: false,
            yesOption: 0,
            noOption: 0,
            abstainOption: 0,
            vetoOption: 0
        };

        this.ledger = new Ledger({testModeAllowed: false});

        window.keplr.defaultOptions = {
            sign: {
                preferNoSetFee: true,
            }
        };
    }

    close = () => {
        if (this.state.txHash && (this.state.actionType === Types.DELEGATE ||
            this.state.actionType === Types.REDELEGATE ||
            this.state.actionType === Types.UNDELEGATE
        )) { location.reload();
        }
        this.setState({
            multisendRows: [{},{}],
            yesOption: 0,
            noOption: 0,
            abstainOption: 0,
            vetoOption: 0,
            activeTab: '2',
            errorMessage: '',
            isOpen: false,
            actionType: undefined,
            loading: undefined,
            loadingBalance: undefined,
            currentUser: undefined,
            delegateAmount: undefined,
            transferTarget: undefined,
            transferAmount: undefined,
            success: undefined,
            useMaxAmount: undefined,
            targetValidator: undefined,
            simulating: undefined,
            gasEstimate: undefined,
            txMsg: undefined,
            params: undefined,
            proposalType: Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_TEXT,
            proposalTitle: undefined,
            proposalDescription: undefined,
            planName: undefined,
            planHeight: undefined,
            planInfo: undefined,
            subjectClientId: undefined,
            substituteClientId: undefined,
            upgradedClientState: undefined,
            changeSubspace: undefined,
            changeKey: undefined,
            changeValue: undefined,
            poolRecipient: undefined,
            poolAmount: undefined,
            depositAmount: undefined,
            voteOption: undefined,
            memo: DEFAULT_MEMO
        });
    }
    static getDerivedStateFromProps(props, state) {
        if (state.user !== localStorage.getItem(CURRENTUSERADDR)) {
            return {
                user: localStorage.getItem(CURRENTUSERADDR),
                pubKey: localStorage.getItem(CURRENTUSERPUBKEY)
            };
        }
        return null;
    }

    initStateOnLoad = (action, state) => {
        this.setState({
            loading: true,
            [action]: true,
            ...state,
        })
    }

    setStateOnSuccess = (action, state) => {
        this.setState({
            loading: false,
            [action]: false,
            errorMessage: '',
            ...state,
        });
    }

    setStateOnError = (action, errorMsg, state={}) => {
        this.setState({
            loading: false,
            [action]: false,
            errorMessage: errorMsg,
            ...state,
        });
    }

    componentDidUpdate(prevProps, prevState) {
        this.autoOpenModal();
        if ((this.state.isOpen && !prevState.isOpen) || (this.state.user && this.state.user != prevState.user)) {
            if (!this.state.success)
                this.tryConnect();
            this.getBalance();
        }
    }

    componentDidMount() {
        this.autoOpenModal()
    }

    autoOpenModal = () => {
        let query = this.props.history && this.props.history.location.search.substr(1)
        if (query && !this.state.isOpen) {
            let params = qs.parse(query)
            if (params.signin == undefined && params.action && this.supportAction(params.action)) {
                this.props.history.push(this.props.history.location.pathname)
                this.openModal(params.action, this.filterParams(params))
            }
        }
    }

    supportAction() {
        return false
    }

    filterParams() {
        return {}
    }

    getBalance = () => {
        if (this.state.loadingBalance) return

        this.initStateOnLoad('loadingBalance', {
            loading: this.state.actionType === Types.DELEGATE || this.state.actionType === Types.WITHDRAW ,
            loadingRedelegations: this.state.actionType === Types.REDELEGATE
        });

        if (this.state.actionType === Types.REDELEGATE) {
            Meteor.call('accounts.getAllRedelegations', this.state.user, this.props.validator.operator_address, (error, result) => {
                try{
                    if (result)
                        this.setStateOnSuccess('loadingRedelegations', {redelegations: result})
                    if (!result || error) {
                        this.setStateOnError('loadingRedelegations')
                    }
                } catch (e) {
                    this.setStateOnError('loadingRedelegations', e.message);
                }
            })
        }

        Meteor.call('accounts.getAccountDetail', this.state.user, (error, result) => {
            try{
                if (result) {
                    let coin = result.coins && result.coins.length > 0 ? (new Coin(result.coins[0].amount, result.coins[0].denom)): (new Coin(0, Meteor.settings.public.coins[0].displayName));
                    this.setStateOnSuccess('loadingBalance', {
                        currentUser: {
                            accountNumber: result.account_number,
                            sequence: result.sequence || 0,
                            availableCoin: coin
                        }})
                }
                if (!result || error) {
                    this.setStateOnError(
                        'loadingBalance',
                        `Failed to get account info for ${this.state.user}`,
                        { activeTab: '0' }
                    )
                }
            } catch (e) {
                this.setStateOnError('loadingBalance', e.message);
            }
        })
    }

    tryConnect = () => {
        this.ledger.getCosmosAddress().then((res) => {
            if (res.address == this.state.user)
                this.setState({
                    success: true,
                    activeTab: this.state.activeTab ==='1' ? '2': this.state.activeTab
                })
            else {
                if (this.state.isOpen) {
                    this.setState({
                        success: false,
                        activeTab: '0',
                        errorMessage: ''//`Currently logged in as another user ${this.state.user}`
                    })
                }
            }
        }, (err) => this.setState({
            success: false,
            activeTab: '1'
        }));
    }

    getTxContext = () => {
        return {
            chainId: Meteor.settings.public.chainId,
            bech32: this.state.user,
            accountNumber: this.state.currentUser.accountNumber,
            sequence: this.state.currentUser.sequence,
            denom: Coin.StakingCoin.denom,
            pk: this.state.pubKey,
            path: [44, Meteor.settings.public.ledger.coinType, 0, 0, 0],
            memo: this.state.memo
        }
    }

    createMessage = (callback) => {
        let txMsg;

        switch (this.state.actionType) {
        case Types.DELEGATE:
            txMsg = Ledger.createDelegate(
                this.getTxContext(),
                this.props.validator.operator_address,
                this.state.delegateAmount.amount)
            break;
        case Types.REDELEGATE:
            txMsg = Ledger.createRedelegate(
                this.getTxContext(),
                this.props.validator.operator_address,
                this.state.targetValidator.operator_address,
                this.state.delegateAmount.amount)
            break;
        case Types.UNDELEGATE:
            txMsg = Ledger.createUndelegate(
                this.getTxContext(),
                this.props.validator.operator_address,
                this.state.delegateAmount.amount);
            break;
        case Types.WITHDRAW:
            txMsg = Ledger.createWithdraw(
                this.getTxContext(),
                Validators.find(
                    {"jailed": false, "status": 'BOND_STATUS_BONDED'},
                    {"sort":{"description.moniker":1}}
                )
            );
            break;
        case Types.SEND:
            txMsg = Ledger.createTransfer(
                this.getTxContext(),
                this.state.transferTarget,
                this.state.transferAmount.amount);
            break;
        case Types.MULTISEND:
            txMsg = Ledger.createMultiTransfer(
                this.getTxContext(),
                this.state.multisendRows);
            break;
        case Types.SUBMITPROPOSAL:
            let proposalData = {
                proposalTitle: this.state.proposalTitle, 
                proposalDescription: this.state.proposalDescription, 
                proposalType: this.state.proposalType,
            };

            switch(this.state.proposalType){
            default:
            case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_TEXT:
            case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_CANCEL_SOFTWARE_UPDATE:
                break;
            case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_SOFTWARE_UPDATE:
                proposalData.planName = this.state.planName;
                proposalData.planHeight = this.state.planHeight;
                proposalData.planInfo = this.state.planInfo;
                break;
            case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_PARAM_CHANGE:
                proposalData.changeSubspace = this.state.changeSubspace;
                proposalData.changeKey = this.state.changeKey;
                proposalData.changeValue = this.state.changeValue;
                break;
            case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_IBC_UPGRADE:
                proposalData.planName = this.state.planName;
                proposalData.planHeight = this.state.planHeight;
                proposalData.planInfo = this.state.planInfo;
                proposalData.upgradedClientState = this.state.upgradedClientState;
                break
            case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_UPDATE_CLIENT:
                proposalData.subjectClientId = this.state.subjectClientId;
                proposalData.substituteClientId = this.state.substituteClientId;
                break;
            case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_COMMUNITY_POOL_SPEND:
                proposalData.poolRecipient = this.state.poolRecipient;
                proposalData.poolAmount = this.state.poolAmount + "0".repeat(18);
                proposalData.poolDenom = Meteor.settings.public.bondDenom;
                break;
            }

            txMsg = Ledger.createSubmitProposal(
                this.getTxContext(),
                proposalData,
                this.state.depositAmount.amount);
            break;
        case Types.VOTE:
            txMsg = Ledger.createVote(
                this.getTxContext(),
                this.props.proposalId,
                this.state.voteOption);
            break;
        case Types.WEIGHTEDVOTE:
            txMsg = Ledger.createWeightedVote(
                this.getTxContext(),
                this.props.proposalId,
                this.state.yesOption,
                this.state.abstainOption,
                this.state.noOption,
                this.state.vetoOption);
            break;
        case Types.DEPOSIT:
            txMsg = Ledger.createDeposit(
                this.getTxContext(),
                this.props.proposalId,
                this.state.depositAmount.amount);
            break;
        }
        //callback(txMsg, this.getSimulateBody(txMsg))        
        callback(txMsg)
    }

    getSimulateBody (txMsg) {
        return (txMsg && txMsg.value && txMsg.value.msg &&
            txMsg.value.msg.length && txMsg.value.msg[0].value) || {}
    }

    getPath = () => {
        let meta = TypeMeta[this.state.actionType];
        return `${meta.pathPreFix}/${this.state.user}/${meta.pathSuffix}`;
    }

    simulate = () => {
        if (this.state.simulating) return this.initStateOnLoad('simulating')
        
        try {
            //this.createMessage(this.runSimulatation);
            this.createMessage(this.sign);
        } catch (e) {
            this.setStateOnError('simulating', e.message)
        }
    }

    runSimulatation = (txMsg, simulateBody) => {
        let gasAdjustment = TypeMeta[this.state.actionType].gasAdjustment || DEFAULT_GAS_ADJUSTMENT;
        Meteor.call('transaction.simulate', txMsg, this.state.user, this.state.currentUser.accountNumber, this.state.currentUser.sequence, this.getPath(), gasAdjustment, (err, res) =>{
            if (res){
                Ledger.applyGas(txMsg, res, Meteor.settings.public.ledger.gasPrice, Coin.StakingCoin.denom);
                this.setStateOnSuccess('simulating', {
                    gasEstimate: res,
                    activeTab: '3',
                    txMsg: txMsg
                })
            }
            else {
                this.setStateOnError('simulating', 'something went wrong')
            }
        })
    }

    calculateFee = (gasLimit, { denom, amount: gasPriceAmount }) => {
        const amount = Math.ceil(gasPriceAmount.multiply(new math.Uint53(gasLimit)).toFloatApproximation());
        return {
            amount: (0, amino.coins)(amount.toString(), denom),
            gas: gasLimit.toString(),
        };
    }

    estimateFee = async (client, gasPrice, signerAddress, messages, memo = "") => {
        const multiplier = 1.3;
        const gasEstimation = await client.simulate(signerAddress, messages, memo);
        return (0, this.calculateFee)(Math.round(gasEstimation * multiplier), gasPrice);
    }

    sign = async (txMsg) => {
        if (this.state.signing) {
            return;
        }
        const myRegistry = new Registry([
            ...defaultRegistryTypes,
            ["/cosmos.gov.v1beta1.MsgSubmitProposal", MsgSubmitProposal],
            ["/cosmos.gov.v1beta1.MsgDeposit", MsgDeposit],
            ["/cosmos.gov.v1beta1.MsgVote", MsgVote],
            ["/cosmos.gov.v1beta1.MsgVoteWeighted", MsgVoteWeighted]
            // Replace with your own type URL and Msg class
        ]);

        this.initStateOnLoad('signing')
        
        try {
            const chainId = Meteor.settings.public.chainId;
            await window.keplr.enable(chainId);

            const offlineSigner = window.getOfflineSignerOnlyAmino(chainId);

            const rpcEndpoint = Meteor.settings.public.urls.rpc;
            const client = await SigningStargateClient.connectWithSigner(rpcEndpoint, offlineSigner, {
                registry: myRegistry,
            });

            const account = (await offlineSigner.getAccounts())[0];

            const fee = await this.estimateFee(client, GasPrice.fromString(Meteor.settings.public.ledger.gasPrice), account.address, txMsg.msgAny, txMsg.memo);

            const result = await client.signAndBroadcast(
                account.address,
                txMsg.msgAny,
                fee,
                txMsg.memo,
            );
            
            assertIsDeliverTxSuccess(result);

            this.setStateOnSuccess('signing', {
                txHash: result,
                activeTab: '4'
            })
        } catch (e){
            this.setStateOnError('signing', e.message)
            console.log(e);
        }
    }

    setMaxAmount = () => {
        let maxValue = separateFractions(this.props.currentDelegation.balance.amount);
        const transferValue = new Coin(maxValue, Coin.StakingCoin.displayName);
        maxValue = cutTrailingZeroes(maxValue);
        this.setState({delegateAmount: transferValue, useMaxAmount: true}, () => {
            var el = document.getElementById("delegateAmount");
            el.value=maxValue;
      });
    }

    handleInputChange = (e) => {       
        let target = e.currentTarget;
        let dataset = target.dataset;
        let value;
        switch (dataset.type) {
        case 'validator':
            value = { moniker: dataset.moniker, operator_address: dataset.address};
            break;
        case 'coin':
            value = new Coin(target.value, target.nextSibling.innerText);
            break;
        case 'type':
            value = parseInt(target.value);
            break;
        case 'weightedVote':
            value = parseInt(target.value);
            break;
        default:
            value = target.value;
        }
        this.setState({[target.name]: value, useMaxAmount: false});
    }

    redirectToSignin = () => {
        Ledger.connectKeplr();
        this.close();
    }

    populateRedirectParams = () => {
        return { action: this.state.actionType }
    }

    isDataValid = () => {
        return this.state.currentUser != undefined;
    }

    getActionButton = () => {
        if (this.state.activeTab === '0')
            return <Button color="primary"  onClick={this.redirectToSignin}>Sign in With Keplr</Button>
        if (this.state.activeTab === '1')
            return <Button color="primary"  onClick={this.redirectToSignin}>Sign in With Keplr</Button> //onClick={this.tryConnect}>Continue</Button>
        if (this.state.activeTab === '2')
            return this.state.useMaxAmount? <Button color="primary" onClick={this.simulate}>{'Next'}</Button>:
            <Button color="primary"  disabled={this.state.simulating || !this.isDataValid()} onClick={this.simulate}>
                {(this.state.errorMessage !== '')?'Retry':'Next'}
            </Button>
        if (this.state.activeTab === '3')
            return <Button color="primary"  disabled={this.state.signing} onClick={this.sign}>
                {(this.state.errorMessage !== '')?'Retry':'Sign'}
            </Button>
    }

    openModal = (type, params={}) => {
        if (!TypeMeta[type]) {
            console.warn(`action type ${type} not supported`)
            return;
        }
        this.setState({
            ...params,
            actionType: type,
            isOpen: true,
            params: params
        })
    }

    getValidatorOptions = () => {
        let activeValidators = Validators.find(
            {"jailed": false, "status": 'BOND_STATUS_BONDED'},
            {"sort":{"description.moniker":1}}
        );

        let redelegations = this.state.redelegations || {};
        let maxEntries = (this.props.stakingParams&&this.props.stakingParams.max_entries)?this.props.stakingParams.max_entries:7;
        return <UncontrolledDropdown direction='down' size='sm' className='redelegate-validators'>
            <DropdownToggle caret={true}>
                {this.state.targetValidator?this.state.targetValidator.moniker:'Select a Validator'}
            </DropdownToggle>
            <DropdownMenu modifiers={maxHeightModifier}>
                {activeValidators.map((validator, i) => {
                    if (validator.address === this.props.validator.address) return null

                    let redelegation = redelegations[validator.operator_address]
                    let disabled = redelegation && (redelegation.count >= maxEntries);
                    let completionTime = disabled?<TimeStamp time={redelegation.completionTime}/>:null;
                    let id = `validator-option${i}`
                    return <div id={id} className={`validator disabled-btn-wrapper${disabled?' disabled':''}`}  key={i}>
                        <DropdownItem name='targetValidator'
                            onClick={this.handleInputChange} data-type='validator' disabled={disabled}
                            data-moniker={validator.description.moniker} data-address={validator.operator_address}>
                            <Row>
                                <Col xs='12' className='moniker'>{validator.description.moniker}</Col>
                                <Col xs='6' className="voting-power data">
                                    <i className="material-icons">power</i>
                                    {validator.tokens ? (new BigNumber(validator.tokens)).toString(10) : 0}
                                </Col>

                                <Col xs='3' className="commission data">
                                    <i className="material-icons">call_split</i>
                                    {numbro(validator.commission.commission_rates.rate).format('0.00%')}
                                </Col>
                                <Col xs='3' className="uptime data">
                                    <Progress value={validator.uptime} style={{width:'100%'}}>
                                        {validator.uptime?numbro(validator.uptime/100).format('0%'):0}
                                    </Progress>
                                </Col>
                            </Row>
                        </DropdownItem>
                        {disabled?<UncontrolledTooltip placement='bottom' target={id}>
                            <span>You have {maxEntries} regelegations from {this.props.validator.description.moniker}
                                 to {validator.description.moniker},
                                you cannot redelegate until {completionTime}</span>
                        </UncontrolledTooltip>:null}
                    </div>
                })}
            </DropdownMenu>
        </UncontrolledDropdown>
    }

    getWarningMessage = () => {
        return null
    }

    renderConfirmationTab = () => {
        if (!this.state.actionType) return;
        return <TabPane tabId="3">
            <div className='action-summary-message'>{this.getConfirmationMessage()}</div>
            <div className='warning-message'>{this.getWarningMessage()}</div>
            <div className='confirmation-message'>If that's correct, please click next and sign in your ledger device.</div>
        </TabPane>
    }

    renderModal = () => {
        return  <Modal style={this.state.multisendRows.length<4?{maxHeight: "350px !important"}:{}} isOpen={this.state.isOpen} toggle={this.close} className={this.state.actionType === 'multiSend'?"ledger-modal multi-send-modal":"ledger-modal"}>
            <ModalBody>
                <TabContent className='ledger-modal-tab' activeTab={this.state.activeTab}>
                    <TabPane tabId="0">Please connect your Keplr wallet.</TabPane>
                    <TabPane tabId="1">
                        Please connect your Keplr wallet.
                    </TabPane>
                    {this.renderActionTab()}
                    {this.renderConfirmationTab()}
                    <TabPane tabId="4">
                        <div>Transaction is broadcasted. Verify it at
                            {this.state.txHash ? <Link to={`/transactions/${this.state.txHash.transactionHash}?new`}> transaction page. </Link> : ''}
                        </div>
                        <div>See your activities at <Link to={`/account/${this.state.user}`}>your account page</Link>.</div>
                    </TabPane>
                </TabContent>
                {this.state.loading?<Spinner type="grow" color="primary" />:''}
                <p className="error-message">{this.state.errorMessage}</p>
            </ModalBody>
            <ModalFooter>
                {this.getActionButton()}
                <Button color="secondary" disabled={this.state.signing} onClick={this.close}>Close</Button>
            </ModalFooter>
        </Modal>
    }
}

class DelegationButtons extends LedgerButton {
    constructor(props) {
        super(props);
    }

    getDelegatedToken = (currentDelegation) => {
        if (currentDelegation && currentDelegation.balance.amount && currentDelegation.tokenPerShare) {
            return new Coin(currentDelegation.balance.amount * currentDelegation.tokenPerShare);
        }
        return null
    }

    supportAction(action) {
        return action === Types.DELEGATE || action === Types.REDELEGATE || action === Types.UNDELEGATE;
    }

    isDataValid = () => {
        if (!this.state.currentUser) return false;

        let maxAmount;
        if (this.state.actionType === Types.DELEGATE) {
            maxAmount = this.state.currentUser.availableCoin;
        } else{
            maxAmount = this.getDelegatedToken(this.props.currentDelegation);
        }

        let isValid = isBetween(this.state.delegateAmount, (new BigNumber(1)).dividedBy(Coin.StakingCoin.fraction), maxAmount)

        if (this.state.actionType === Types.REDELEGATE)
            isValid = isValid || (this.state.targetValidator &&
                this.state.targetValidator.operator_address &&
                isValidatorAddress(this.state.targetValidator.operator_address))
        return isValid
    }

    renderActionTab = () => {
        if (!this.state.currentUser) return null
        let action;
        let target;
        let maxAmount;
        let availableStatement;

        let moniker = this.props.validator.description && this.props.validator.description.moniker;
        let validatorAddress = <span className='ellipic'>this.props.validator.operator_address</span>;
        switch (this.state.actionType) {
        case Types.DELEGATE:
            action = 'Delegate to';
            maxAmount = this.state.currentUser.availableCoin;
            availableStatement = 'your available balance:'
            break;
        case Types.REDELEGATE:
            action = 'Redelegate from';
            target = this.getValidatorOptions();
            maxAmount = this.getDelegatedToken(this.props.currentDelegation);
            availableStatement = 'your delegated tokens:'
            break;
        case Types.UNDELEGATE:
            action = 'Undelegate from';
            maxAmount = this.getDelegatedToken(this.props.currentDelegation);
            availableStatement = 'your delegated tokens:'
            break;
        }
        return <TabPane tabId="2">
            <h3>{action} {moniker?moniker:validatorAddress} {target?'to':''} {target}</h3>
            <InputGroup>
                {(this.state.actionType !== Types.DELEGATE)?<Button color="primary"  onClick={this.setMaxAmount}>{this.state.actionType + " ALL"}</Button>:""}
                <Input 
                    id="delegateAmount" 
                    name="delegateAmount" 
                    onChange={this.handleInputChange} 
                    data-type='coin' addon={false}
                    placeholder="Amount" 
                    min={Coin.MinStake} 
                    max={maxAmount.stakingAmount} 
                    type="number" 
                    onKeyDown={event => {if (['e', 'E', '+', "-"].includes(event.key)) {event.preventDefault()}}}
                    onPaste={(e)=>{e.preventDefault()}} 
                    onCopy={(e)=>{ e.preventDefault()}}
                    invalid={this.state.useMaxAmount?!this.state.useMaxAmount:this.state.delegateAmount != null && !isBetween(this.state.delegateAmount, (new BigNumber(1)).dividedBy(Coin.StakingCoin.fraction), maxAmount)} />
                <InputGroupAddon addonType="append">{Coin.StakingCoin.displayName}</InputGroupAddon>        
            </InputGroup>
            <Input name="memo" onChange={this.handleInputChange}
                placeholder="Memo(optional)" type="textarea" value={this.state.memo}/>
            <div>{availableStatement} <Amount coin={maxAmount}/> </div>
        </TabPane>
    }

    getWarningMessage = () => {
        let duration = parseInt(this.props.stakingParams.unbonding_time.substr(0, this.props.stakingParams.unbonding_time.length-1));
        let maxEntries = this.props.stakingParams.max_entries;
        let warning = TypeMeta[this.state.actionType].warning;
        return warning && warning(duration, maxEntries);
    }

    getConfirmationMessage = () => {
        switch (this.state.actionType) {
        case Types.DELEGATE:
            return <span>You are going to <span className='action'>delegate</span> <Amount coin={this.state.delegateAmount}/> to <AccountTooltip address={this.props.validator.operator_address} sync/> with <Fee gas={this.state.gasEstimate}/>.</span>
        case Types.REDELEGATE:
            return <span>You are going to <span className='action'>redelegate</span> <Amount coin={this.state.delegateAmount}/> from <AccountTooltip address={this.props.validator.operator_address} sync/> to <AccountTooltip address={this.state.targetValidator && this.state.targetValidator.operator_address} sync/> with <Fee gas={this.state.gasEstimate}/>.</span>
        case Types.UNDELEGATE:
            return <span>You are going to <span className='action'>undelegate</span> <Amount coin={this.state.delegateAmount}/> from <AccountTooltip address={this.props.validator.operator_address} sync/> with <Fee gas={this.state.gasEstimate}/>.</span>
        }
    }

    renderRedelegateButtons = () => {
        let delegation = this.props.currentDelegation;
        if (!delegation) return null;
        let completionTime = delegation.redelegationCompletionTime;
        let isCompleted = !completionTime || new Date() >= completionTime;
        let maxEntries = this.props.stakingParams?this.props.stakingParams.max_entries:7;
        let canUnbond = !delegation.unbonding || maxEntries > delegation.unbonding;
        return <span>
            <div id='redelegate-button' className={`disabled-btn-wrapper${isCompleted?'':' disabled'}`}>
                <Button color="warning" size="lg" disabled={!isCompleted}
                    onClick={() => this.openModal(Types.REDELEGATE)}>
                    {TypeMeta[Types.REDELEGATE].button}
                </Button>
                {isCompleted?null:<UncontrolledTooltip placement='bottom' target='redelegate-button'>
                    <span>You have incompleted regelegation to this validator,
                        you can't redelegate until <TimeStamp time={completionTime}/>
                    </span>
                </UncontrolledTooltip>}
            </div>
            <div id='undelegate-button' className={`disabled-btn-wrapper${canUnbond?'':' disabled'}`}>
                <Button color="danger" size="lg" disabled={!canUnbond}
                    onClick={() => this.openModal(Types.UNDELEGATE)}>
                    {TypeMeta[Types.UNDELEGATE].button}
                </Button>
                {canUnbond?null:<UncontrolledTooltip placement='bottom' target='undelegate-button'>
                    <span>You reached maximum {maxEntries} unbonding delegation entries,
                        you can't delegate until the first one matures at <TimeStamp time={delegation.unbondingCompletionTime}/>
                    </span>
                </UncontrolledTooltip>}
            </div>
        </span>
    }

    render = () => {
        return <span className="ledger-buttons-group float-right">
            
            {/* DISABLING CONDITIONAL DELEGATE BUTTON
            {isActiveValidator(this.props.validator)?<Button color="success"
                size="lg" onClick={() => this.openModal(Types.DELEGATE)}>
                {TypeMeta[Types.DELEGATE].button}
            </Button>:null} 
            */}
            
            <Button color="success"
                size="lg" onClick={() => this.openModal(Types.DELEGATE)}>
                {TypeMeta[Types.DELEGATE].button}
            </Button>
            {this.renderRedelegateButtons()}
            {this.renderModal()}
        </span>;
    }
}

class WithdrawButton extends LedgerButton {

    // createMessage = (callback) => {
    //     Meteor.call('transaction.execute', {from: this.state.user}, this.getPath(), (err, res) =>{
    //         if (res){
    //             Meteor.call('isValidator', this.state.user ,(error, result) => {
    //                 if (result && result.address){
    //                     res.value.msg.push({
    //                         type: 'cosmos-sdk/MsgWithdrawValidatorCommission',
    //                         value: { validator_address: result.address }
    //                     })
    //                 }
    //                 callback(res, res)
    //             })
    //         }
    //         else {
    //             this.setState({
    //                 loading: false,
    //                 simulating: false,
    //                 errorMessage: 'something went wrong'
    //             })
    //         }
    //     })
    // }

    supportAction(action) {
        return action === Types.WITHDRAW;
    }

    renderActionTab = () => {
        return <TabPane tabId="2">
            <h3>Withdraw rewards from all delegations</h3>
            {this.props.rewards?<div>Your current rewards amount is: <CoinAmount amount={this.props.rewards} denom={this.props.denom}/></div>:''}
            {this.props.commission?<div>Your current commission amount is: <CoinAmount amount={this.props.commission} denom={this.props.denom}/></div>:''}
        </TabPane>
    }

    getConfirmationMessage = () => {
        return <span>You are going to <span className='action'>withdraw</span> rewards <CoinAmount amount={this.props.rewards} denom={this.props.denom}/>
            {this.props.commission?<span> and commission <CoinAmount amount={this.props.commission} denom={this.props.denom}/></span>:null}
            <span> with  <Fee gas={this.state.gasEstimate}/>.</span>
        </span>
    }

    render = () => {
        return <span className="ledger-buttons-group float-right">
            <Button color="success" size="sm" disabled={!this.props.rewards}
                onClick={() => this.openModal(Types.WITHDRAW)}>
                {TypeMeta[Types.WITHDRAW].button}
            </Button>
            {this.renderModal()}
        </span>;
    }
}

class MultiSendButton extends LedgerButton {
    handleChange = idx => e => {
        const { name, value } = e.target;
        const multisendRows = [...this.state.multisendRows];
        multisendRows[idx][name] = value;

        this.setState({
            multisendRows
        });
    };
    handleAddRow = () => {
        const item = {
            recipient: "",
            cudos: ""
        };
        this.setState({
            multisendRows: [...this.state.multisendRows, item],
        });
        setTimeout(() => { this.scr.scrollIntoView({ behavior: "smooth", block: 'nearest', inline: 'start' }) }, 200);
    };

    scrollToBottom = () => {

    }

    handleRemoveSpecificRow = (idx) => () => {
        const multisendRows = [...this.state.multisendRows]
        multisendRows.splice(idx, 1);
        this.setState({ multisendRows });
    }
    
    MultiSendTotal = () => {
        let total = 0;
        this.state.multisendRows.forEach((recipient) => {
            const amount = parseInt(recipient.cudos);
            if (isNaN(amount)) {
                total += 0
            } else { total += amount }
        })
        return total?total:0;
    }

    handleCsvClick = () => {
        document.getElementById("csv-file").click();
    }

    renderActionTab = () => {
        if (!this.state.currentUser) return null;

        let fileReader;
        const handleFileRead = (e) => {
            let invdalidData = false;
            const content = fileReader.result.split('\n');
            
            let txBatch = [];
            for (let line of content) {
                line = line.trim();
                if (line.length === 0) { invdalidData = true; break };

                const columns = line.split(',');
                if (columns.length !== 2) { invdalidData = true; break };
                
                const recipient = columns[0]
                const amount = parseInt(columns[1])
                if (recipient === undefined || recipient === '' || amount === undefined || amount === 0) { invdalidData = true; break };
     
                const item = {
                    recipient: recipient,
                    cudos: amount.toString()
                };

                txBatch.push(item)
            }
        
            this.setState({
                multisendRows: txBatch,
            });

            this.openModal(Types.MULTISEND, {})
        };
        
        const handleFileChosen = (file) => {
          fileReader = new FileReader();
          fileReader.onloadend = handleFileRead;
          fileReader.readAsText(file);
        };

        const toolTip = '<address>, <amount>\n<address>, <amount>'
        return (
            <>    
            <TableContainer id="multiSendTable" sx={this.state.multisendRows.length<5?
                {
                height: '350px',
                marginBottom: "5px",
                overflow: "auto",
                }:{
                marginBottom: "5px",
                display: "flex",
                height: '350px',
                overflow: "auto",
                }}> 
                <Table sx={this.state.multisendRows.length===1?{ position: "sticky", top: "50%", height: "max-content" }:{ position: "sticky", top: "25%", height: "max-content" }}>
                    <TableBody>
                    {this.state.multisendRows.map((item, idx) => (
                        <TableRow key={idx} ref={e => this.scr = e}>
                            <TableCell style={{ width:"0%", textAlign: "center",verticalAlign: "middle" }} >{idx+1}</TableCell>
                            <TableCell>
                                <Input
                                type="text"
                                name="recipient"
                                placeholder="address"
                                value={this.state.multisendRows[idx].recipient}
                                onPaste={this.handleChange(idx)}
                                onChange={this.handleChange(idx)}
                                className="form-control"
                                />
                            </TableCell>
                            <TableCell style={{ width:"20%" }}>
                                <Input
                                style={{textAlign: "center"}}
                                type="number"
                                name="cudos"
                                placeholder="amount"
                                onKeyDown={event => {if (['e', 'E', '+', "-", ".", ","].includes(event.key)) {event.preventDefault()}}}
                                onPaste={(e)=>{e.preventDefault()}} 
                                onCopy={(e)=>{ e.preventDefault()}}
                                min={1}
                                value={this.state.multisendRows[idx].cudos}
                                onChange={this.handleChange(idx)}
                                className="form-control"
                                />
                            </TableCell>
                            <TableCell style={{ width:"10%", textAlign: "center",verticalAlign: "middle" }}>
                                <Button
                                hidden={idx===0?true:false}
                                className="btn btn-outline-danger btn-sm"
                                onClick={this.handleRemoveSpecificRow(idx)}
                                >
                                X
                                </Button>
                            </TableCell>
                        </TableRow>
                        
                    ))}
                    </TableBody>
                </Table>
                </TableContainer>
                <Table style ={{position: "absolute", left: "31%", bottom: "23%"}}>
                <TableFooter>
                        <TableRow >
                        <TableCell style={{ border: "none", textAlign: "right",verticalAlign: "middle" }}>Total:</TableCell>
                        <TableCell style={{ width:"0%", textAlign: "center",verticalAlign: "middle" }}>{this.MultiSendTotal()}</TableCell>
                        <TableCell style={{ border: "none" }}>JMES</TableCell>
                        </TableRow>
                </TableFooter>
                </Table>
                <Button onClick={this.handleAddRow} className="btn btn-primary">
                    Add Row
                </Button>
                <Tooltip
                    style = {{width: "300px"}}
                    arrow="0"
                    radius="5"
                    content={toolTip}
                    background="#1B2031"
                    border="#1B2031"
                    fontSize="12px"
                >
                    <Button style = {{ marginLeft: "10px", display: "inline-flex", alignItems: "center", textTransform: "lowercase"}} onClick={this.handleCsvClick} className="btn btn-sm">
                        Upload from .CSV
                    </Button>
                </Tooltip>
                <Input
                    name="multiSendCsv"
                    type='file'
                    id='csv-file'
                    className='csv-file'
                    accept='.csv'
                    onChange={e => handleFileChosen(e.target.files[0])}
                    hidden
                />
                <Input name="memo" onChange={this.handleInputChange}
                    placeholder="Memo(optional)" type="textarea" value={this.state.memo}/>
                <div><span style={this.notEnoughBalance()?{ fontWeight: 'lighter', color: 'red' }:{ fontWeight: 'lighter' }}>your available balance: <Amount coin={this.state.currentUser.availableCoin}/></span></div>
            </>
        );
    }

    supportAction(action) {
        return action === Types.MULTISEND;
    }

    filterParams(params) {
        return {
            transferTarget: params.transferTarget
        }
    }

    notEnoughBalance = () => {
        const userBalance = parseInt(this.state.currentUser.availableCoin.stakingAmount.toString())
        return this.MultiSendTotal() > userBalance;
    }

    isDataValid = () => {
        if (!this.state.currentUser) return false;
        if (this.state.actionType === 'multiSend') {   
            if (this.notEnoughBalance()) return false

            let validData = true;
            this.state.multisendRows.forEach((row) => {
                const recipient = row.recipient;
                const amount = row.cudos;
                
                if (recipient === undefined || recipient === '' || amount === undefined || amount === '' || amount < '1') {
                    validData = false;
                } else {
                    const addressCheck = row.recipient.replace(/^cudos[0-9a-z]{39}$/gm, 'OK');
                    const amountCheck = row.cudos.replace(/^[1-9]{1}[0-9]*$/gm, 'OK');
                    if (addressCheck !== 'OK' || amountCheck !== 'OK') {
                        validData = false;
                    };
                };
            });
            return validData
        };
        return isBetween(this.state.transferAmount, (new BigNumber(1)).dividedBy(Coin.StakingCoin.fraction), this.state.currentUser.availableCoin)
    };

    getConfirmationMessage = () => {
        return <span>You are going to <span className='action'>send</span> <Amount coin={this.state.transferAmount}/> to {this.state.transferTarget}
            <span> with <Fee gas={this.state.gasEstimate}/>.</span>
        </span>
    }

    render = () => {
        let params = {};
        let button = TypeMeta[Types.MULTISEND].button;
        if (this.props.address !== this.state.user) {
            params = {transferTarget: this.props.address}
        }
        return <span className="ledger-buttons-group float-right">
            <Button color="info" size="sm" onClick={() => this.openModal(Types.MULTISEND, params)}> {button} </Button>
            {this.renderModal()}
        </span>;
    }
}

class TransferButton extends LedgerButton {
    renderActionTab = () => {
        if (!this.state.currentUser) return null;
        let maxAmount = this.state.currentUser.availableCoin;
        return <TabPane tabId="2">
            <h3>Transfer {Coin.StakingCoin.displayName}</h3>
            <InputGroup>
                <Input name="transferTarget" onChange={this.handleInputChange}
                    placeholder="Send to" type="text"
                    value={this.state.transferTarget}
                    invalid={this.state.transferTarget != null && !isAddress(this.state.transferTarget)}/>
            </InputGroup>
            <InputGroup>
                <Input name="transferAmount" onChange={this.handleInputChange}
                    data-type='coin' placeholder="Amount"
                    min={Coin.MinStake} max={maxAmount.stakingAmount} type="number"
                    invalid={this.state.transferAmount != null && !isBetween(this.state.transferAmount, (new BigNumber(1)).dividedBy(Coin.StakingCoin.fraction), maxAmount)}/>
                <InputGroupAddon addonType="append">{Coin.StakingCoin.displayName}</InputGroupAddon>
            </InputGroup>
            <Input name="memo" onChange={this.handleInputChange}
                placeholder="Memo(optional)" type="textarea" value={this.state.memo}/>
            <div>your available balance: <Amount coin={maxAmount}/> </div>
        </TabPane>
    }

    supportAction(action) {
        return action === Types.SEND;
    }

    filterParams(params) {
        return {
            transferTarget: params.transferTarget
        }
    }

    isDataValid = () => {
        if (!this.state.currentUser) return false
        return isBetween(this.state.transferAmount, (new BigNumber(1)).dividedBy(Coin.StakingCoin.fraction), this.state.currentUser.availableCoin)
    }

    getConfirmationMessage = () => {
        return <span>You are going to <span className='action'>send</span> <Amount coin={this.state.transferAmount}/> to {this.state.transferTarget}
            <span> with <Fee gas={this.state.gasEstimate}/>.</span>
        </span>
    }

    render = () => {
        let params = {};
        let button = TypeMeta[Types.SEND].button;
        if (this.props.address !== this.state.user) {
            params = {transferTarget: this.props.address}
            button = TypeMeta[Types.SEND].button_other
        }
        return <span className="ledger-buttons-group float-right">
            <Button color="info" size="sm" onClick={() => this.openModal(Types.SEND, params)}> {button} </Button>
            {this.renderModal()}
        </span>;
    }
}

class SubmitProposalButton extends LedgerButton {
   
    renderActionTab = () => {
        if (!this.state.currentUser) return null;
        let maxAmount = this.state.currentUser.availableCoin;
        let maxPoolAmount = cutFractions(localStorage.getItem("communityPoolValue"));
        let displayMaxPoolAmount = cutFractions(separateFractions(maxPoolAmount))
        localStorage.setItem("displayMaxPoolAmount", displayMaxPoolAmount)
        let fileReader;
  
        const handleFileRead = (e) => {
          const content = fileReader.result;
          this.state.upgradedClientState = JSON.parse(content);
        };
        
        const handleFileChosen = (file) => {
          fileReader = new FileReader();
          fileReader.onloadend = handleFileRead;
          fileReader.readAsText(file);
        };

        return (
            <TabPane tabId="2">
                <h3>Submit A New Proposal</h3>
                <InputGroup>
                    <Input name="proposalType" onChange={this.handleInputChange}
                        placeholder="Type" type="select" data-type="type"
                        value={this.state.proposalType}>
                        {Object.values(Ledger.PROPOSAL_TYPES).map(type => <option key={type} value={type}>{this.getProposalTypeText(type)} proposal</option>)}
                    </Input>
                </InputGroup>
                <InputGroup>
                    <Input name="proposalTitle" onChange={this.handleInputChange}
                        placeholder="Title" type="text"
                        value={this.state.proposalTitle}/>
                </InputGroup>
                <InputGroup>
                    <Input name="proposalDescription" onChange={this.handleInputChange}
                        placeholder="Description" type="textarea"
                        value={this.state.proposalDescription}/>
                </InputGroup>
                { this.state.proposalType === Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_PARAM_CHANGE ?
                    (<>
                        <InputGroup>
                            <Input name="changeSubspace" onChange={this.handleInputChange}
                                placeholder="Change subspace" type="text"
                                value={this.state.changeSubspace}/>
                        </InputGroup>
                        <InputGroup>
                            <Input name="changeKey" onChange={this.handleInputChange}
                                placeholder="Change Key" type="text"
                                value={this.state.changeKey}/>
                        </InputGroup>
                        <InputGroup>
                            <Input name="changeValue" onChange={this.handleInputChange}
                                placeholder="Change Value" type="text"
                                value={this.state.changeValue}/>
                        </InputGroup>
                    </>
                    ) : ''
                }
                { this.state.proposalType === Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_SOFTWARE_UPDATE ?
                    (<>
                        <InputGroup>
                            <Input name="planName" onChange={this.handleInputChange}
                                placeholder="Plan name" type="text"
                                value={this.state.planName}/>
                        </InputGroup>
                        <InputGroup>
                            <Input name="planHeight" onChange={this.handleInputChange}
                                placeholder="Plan height" type="text"
                                value={this.state.planHeight}/>
                        </InputGroup>
                        <InputGroup>
                            <Input name="planInfo" onChange={this.handleInputChange}
                                placeholder="Plan info" type="text"
                                value={this.state.planInfo}/>
                        </InputGroup>
                    </>
                    ) : ''
                }
                { this.state.proposalType === Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_COMMUNITY_POOL_SPEND ?
                    (<>
                        <InputGroup>
                            <Input name="poolRecipient" onChange={this.handleInputChange}
                                placeholder="Spend recipient" type="text"
                                value={this.state.poolRecipient}/>
                        </InputGroup>
                        <InputGroup>
                            <Input name="poolAmount" onChange={this.handleInputChange}
                                placeholder="Spend amount / whole number" type="number"
                                data-type='poolSpend'
                                min={"1"} max={displayMaxPoolAmount}
                                onKeyDown={event => {if (['e', 'E', '+', "-", ",", "."].includes(event.key)) {event.preventDefault()}}}
                                onPaste={(e)=>{e.preventDefault()}} 
                                onCopy={(e)=>{ e.preventDefault()}}
                                value={this.state.poolAmount}
                                invalid={this.state.poolAmount != null && !isBetween(this.state.poolAmount, "1", displayMaxPoolAmount)}
                            />
                            <InputGroupAddon addonType="append">{Coin.StakingCoin.displayName}</InputGroupAddon>
                        </InputGroup>
                        <small><div>available pool balance: <span style={{ color: 'red', fontWeight: 'lighter' }}>{displayMaxPoolAmount} </span> {Coin.StakingCoin.displayName}</div></small>
                    </>
                    ) : ''
                }
                { this.state.proposalType === Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_IBC_UPGRADE ?
                    (<>
                        <InputGroup>
                            <Input name="planName" onChange={this.handleInputChange}
                                placeholder="Upgrade name" type="text"
                                value={this.state.planName}/>
                        </InputGroup>
                        <InputGroup>
                            <Input name="planHeight" onChange={this.handleInputChange}
                                placeholder="Target height to upgrade at" type="number"
                                onKeyDown={event => {if (['e', 'E', '+', "-", ".", ","].includes(event.key)) {event.preventDefault()}}}
                                value={this.state.planHeight}/>
                        </InputGroup>
                        <InputGroup>
                            <Input name="planInfo" onChange={this.handleInputChange}
                                placeholder="Upgrade info" type="text"
                                value={this.state.planInfo}/>
                        </InputGroup>
                        <InputGroup style={{marginTop: "20px"}}>
                        <h5>{"Please select <UpgradedClientState>.json"}</h5>
                        <Input
                            name="upgradedClientState"
                            type='file'
                            id='file'
                            className='input-file'
                            accept='.json'
                            onChange={e => handleFileChosen(e.target.files[0])}
                        />
                        </InputGroup>
                        <hr/>
                    </>
                    ) : ''
                }
                { this.state.proposalType === Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_UPDATE_CLIENT ?
                    (<>
                        <InputGroup>
                            <Input name="subjectClientId" onChange={this.handleInputChange}
                                placeholder="Subject client ID: `{client-type}-{N}`" type="text"
                                value={this.state.subjectClientId}/>
                        </InputGroup>
                        <InputGroup>
                            <Input name="substituteClientId" onChange={this.handleInputChange}
                                placeholder="Substitute client ID: `{client-type}-{N}`" type="text"
                                value={this.state.substituteClientId}/>
                        </InputGroup>
                    </>
                    ) : ''
                }
                <InputGroup>
                    <Input name="depositAmount" onChange={this.handleInputChange}
                        data-type='coin' placeholder="Deposit amount"
                        min={Coin.MinStake} max={maxAmount.stakingAmount} type="number"
                        onKeyDown={event => {if (['e', 'E', '+', "-"].includes(event.key)) {event.preventDefault()}}}
                        onPaste={(e)=>{e.preventDefault()}} 
                        onCopy={(e)=>{ e.preventDefault()}}
                        invalid={this.state.depositAmount != null && !isBetween(this.state.depositAmount, (new BigNumber(1)).dividedBy(Coin.StakingCoin.fraction), maxAmount)}/>
                    <InputGroupAddon addonType="append">{Coin.StakingCoin.displayName}</InputGroupAddon>
                </InputGroup>
                <Input name="memo" onChange={this.handleInputChange}
                    placeholder="Memo(optional)" type="textarea" value={this.state.memo}/>
                <div>your available balance: <Amount coin={maxAmount}/></div> 
            </TabPane>
        )
    }

    getProposalTypeText = (proposalType) => {
        switch(proposalType){
        case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_TEXT:
            return 'Text';
        case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_SOFTWARE_UPDATE:
            return 'Software update';
        case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_PARAM_CHANGE:
            return 'Parameter change';
        case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_COMMUNITY_POOL_SPEND:
            return 'Community pool spend';
        case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_CANCEL_SOFTWARE_UPDATE:
            return 'Cancel software update';
        case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_UPDATE_CLIENT:
            return 'Update client';
        case Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_IBC_UPGRADE:
            return 'IBC upgrade';
        }
    }

    getSimulateBody (txMsg) {
        txMsg = (txMsg && txMsg.value && txMsg.value.msg &&
            txMsg.value.msg.length && txMsg.value.msg[0].value) || {}
        return {...txMsg.content.value,
            initial_deposit: txMsg.initial_deposit,
            proposer: txMsg.proposer,
            proposal_type: "text"
        }
    }

    getPath = () => {
        return TypeMeta[Types.SUBMITPROPOSAL].path
    }

    supportAction(action) {
        return action === Types.SUBMITPROPOSAL;
    }

    isDataValid = () => {
        let isValid = false;
        let displayMaxPoolAmount = localStorage.getItem("displayMaxPoolAmount");

        if (!this.state.currentUser) return isValid

        isValid = this.state.proposalTitle != null && this.state.proposalTitle != "" &&
        this.state.proposalDescription != null && this.state.proposalDescription != "" &&
        this.state.depositAmount != null &&
        isBetween(this.state.depositAmount, (new BigNumber(1)).dividedBy(Coin.StakingCoin.fraction), this.state.currentUser.availableCoin)
        
        if (this.state.proposalType === Ledger.PROPOSAL_TYPES.PROPOSAL_TYPE_COMMUNITY_POOL_SPEND) {
                // isValid = this.state.proposalTitle != null &&
                isValid = isValid && 
                this.state.poolAmount != null && this.state.poolAmount != "" &&
                isBetween(this.state.poolAmount, "1", displayMaxPoolAmount)
            }
        return isValid
    }

    getConfirmationMessage = () => {
        return <span>You are going to <span className='action'>submit</span> a new proposal.
            <div>
                <h3> {this.state.proposalTitle} </h3>
                <div> {this.state.proposalDescription} </div>
                <div> Initial Deposit:
                    <Amount coin={this.state.depositAmount}/>
                </div>
                <span> Fee: <Fee gas={this.state.gasEstimate}/>.</span>
            </div>
        </span>
    }

    render = () => {
        return <span className="ledger-buttons-group float-right">
            <Button color="info" size="sm" onClick={() => this.openModal(Types.SUBMITPROPOSAL, {})}> {TypeMeta[Types.SUBMITPROPOSAL].button} </Button>
            {this.renderModal()}
        </span>;
    }
}

class ProposalActionButtons extends LedgerButton {
    isValidRange = () => {
        return (this.state.yesOption + this.state.noOption + this.state.vetoOption + this.state.abstainOption) === 100;
    }

    totalVote = () => {
        return this.state.yesOption + this.state.noOption + this.state.vetoOption + this.state.abstainOption;
    }

    resetVotes = () => {
        this.setState({
            yesOption: 0,
            noOption: 0,
            vetoOption: 0,
            abstainOption: 0
        })
    }

    renderActionTab = () => {
        if (!this.state.currentUser) return null;
        let maxAmount = this.state.currentUser.availableCoin;

        let inputs;
        let title;
        switch (this.state.actionType) {
        case Types.WEIGHTEDVOTE:
            title=`Distributed Vote on Proposal ${this.props.proposalId}`
            inputs = (
                <div>
                    <h4 style={this.totalVote()===100?{color: "green"}:null}>Casted TOTAL VOTE: {this.totalVote()}%</h4>
                    <InputGroup>
                        <br />  
                        <div>YES: {this.state.yesOption}%</div>
                        <Input 
                            data-type='weightedVote'
                            name="yesOption" 
                            onChange={this.handleInputChange}
                            min={0}
                            max={100}
                            value={this.state.yesOption}                        
                            type="range"
                            disabled={this.isValidRange()?true:false}
                            />
                        <br />
                        <div>NO: {this.state.noOption}%</div>
                        <Input 
                            data-type='weightedVote'
                            name="noOption" 
                            onChange={this.handleInputChange}
                            min={0}
                            max={this.setMaxValidity}
                            value={this.state.noOption}                        
                            type="range"
                            disabled={this.isValidRange()?true:false}
                            />
                        <br />
                        <div>VETO: {this.state.vetoOption}%</div>
                        <Input 
                            data-type='weightedVote'
                            name="vetoOption" 
                            onChange={this.handleInputChange}
                            min={0}
                            max={this.setMaxValidity}
                            value={this.state.vetoOption}                        
                            type="range"
                            disabled={this.isValidRange()?true:false}
                            />
                        <br />
                        <div>ABSTAIN: {this.state.abstainOption}%</div>
                        <Input 
                            data-type='weightedVote'
                            name="abstainOption" 
                            onChange={this.handleInputChange}
                            min={0}
                            max={100}
                            value={this.state.abstainOption}                        
                            type="range"
                            disabled={this.isValidRange()?true:false}
                            />
                        <br />
                        {!this.isValidRange()?
                            <small style={{color: "red"}}>Total vote from all options should match 100%</small>:
                            <div>
                                <small style={{color: "green", paddingRight: "10px"}}>Total vote from all options matches 100%</small>
                                <Button size="sm" color="secondary" onClick={this.resetVotes}>Reset</Button>
                            </div>}  
                        <br />   
                    </InputGroup>       
                </div>       
            )
            break;
        case Types.VOTE:
            title=`Vote on Proposal ${this.props.proposalId}`
            inputs = (<Input type="select" name="voteOption" onChange={this.handleInputChange} defaultValue=''>
                <option value='' disabled>Vote Option</option>
                <option value='Yes'>yes</option>
                <option value='Abstain'>abstain</option>
                <option value='No'>no</option>
                <option value='NoWithVeto'>no with veto</option>
            </Input>)
            break;
        case Types.DEPOSIT:
            title=`Deposit to Proposal ${this.props.proposalId}`
            inputs = (<InputGroup>
                <Input name="depositAmount" onChange={this.handleInputChange}
                    data-type='coin' placeholder="Amount"
                    min={Coin.MinStake} max={maxAmount.stakingAmount} type="number"
                    invalid={this.state.depositAmount != null && !isBetween(this.state.depositAmount, (new BigNumber(1)).dividedBy(Coin.StakingCoin.fraction), maxAmount)}/>
                <InputGroupAddon addonType="append">{Coin.StakingCoin.displayName}</InputGroupAddon>
                <div>your available balance: <Amount coin={maxAmount}/></div>
            </InputGroup>)
            break;
        }
        return <TabPane tabId="2">
            <h3>{title}</h3>
            <br />
            {inputs}
            <Input name="memo" onChange={this.handleInputChange}
                placeholder="Memo(optional)" type="textarea" value={this.state.memo}/>
        </TabPane>

    }

    /*getSimulateBody (txMsg) {
        txMsg = txMsg && txMsg.value && txMsg.value.msg &&
            txMsg.value.msg.length && txMsg.value.msg[0].value || {}
        return {...txMsg.content.value,
            initial_deposit: txMsg.initial_deposit,
            proposer: txMsg.proposer,
            proposal_type: "text"
        }
    }*/

    getPath = () => {
        let {pathPreFix, pathSuffix} = TypeMeta[this.state.actionType];
        return `${pathPreFix}/${this.props.proposalId}/${pathSuffix}`
    }

    supportAction(action) {
        return action === Types.VOTE || action === Types.DEPOSIT;
    }

    componentDidMount(){
        super.componentDidMount();

        this.ledger.getCosmosAddress().then(({pubkey, address}) => {
            Meteor.call('Transactions.findUser', address, {address:1, description:1, operator_address:1, delegator_address:1, profile_url:1}, (error, result) => {
                this.setState({validator: result != false})
            })
        });
    }


    isDataValid = () => {
        if (!this.state.currentUser) return false
        if (this.state.actionType === Types.VOTE) {
            return ['Yes', 'No', 'NoWithVeto', 'Abstain'].indexOf(this.state.voteOption) !== -1;
        } else if (this.state.actionType === Types.WEIGHTEDVOTE) {
            return (this.state.yesOption + this.state.noOption + this.state.vetoOption + this.state.abstainOption) === 100;
        } else {
            return isBetween(this.state.depositAmount, (new BigNumber(1)).dividedBy(Coin.StakingCoin.fraction), this.state.currentUser.availableCoin);
        }
    }

    getConfirmationMessage = () => {
        switch (this.state.actionType) {
        case Types.VOTE:
            return <span>You are <span className='action'>voting</span> <strong>{this.state.voteOption}</strong> on proposal {this.props.proposalId}
                <span> with <Fee gas={this.state.gasEstimate}/>.</span>
            </span>
            break;
        case Types.DEPOSIT:
            return <span>You are <span className='action'>deposit</span> <Amount coin={this.state.depositAmount}/> to proposal {this.props.proposalId}
                <span> with <Fee gas={this.state.gasEstimate}/>.</span>
            </span>
            break;
        }
    }

    render = () => {
        return this.props.proposalStatus === 'PROPOSAL_STATUS_DEPOSIT_PERIOD'|| 
        this.props.proposalStatus === 'PROPOSAL_STATUS_VOTING_PERIOD'?
        <span className="ledger-buttons-group float-right">
            <Row>
                {this.props.voteStarted ? 
                    <Col>
                        <Button color="secondary" size="sm"
                            onClick={() => this.openModal(Types.VOTE, {})}>
                            {TypeMeta[Types.VOTE].button}
                        </Button>
                    </Col> : ''
                }
                {this.props.voteStarted ? 
                    <Col>
                        <Button style={{ whiteSpace: "nowrap",  textAlign: "center" }} color="secondary" size="sm"
                            onClick={() => this.openModal(Types.WEIGHTEDVOTE, {})}>
                            {TypeMeta[Types.WEIGHTEDVOTE].button}
                        </Button>
                    </Col> : ''
                }
                <Col><Button color="success" size="sm"
                    onClick={() => this.openModal(Types.DEPOSIT, {})}>
                    {TypeMeta[Types.DEPOSIT].button}
                </Button></Col>
            </Row>
            {this.renderModal()}
        </span>:null;
    }
}
export {
    DelegationButtons,
    WithdrawButton,
    TransferButton,
    MultiSendButton,
    SubmitProposalButton,
    ProposalActionButtons
}

LedgerButton.propTypes = {
    history: PropTypes.shape({
        length:PropTypes.number,
        action: PropTypes.string,
        location:PropTypes.shape({
            pathname: PropTypes.string,
            search: PropTypes.string,
            hash: PropTypes.string,
            key: PropTypes.string,
        }),
    }),
    rewards:PropTypes.array,
    commission:PropTypes.array,
    denom:PropTypes.string,
}

DelegationButtons.propTypes = {
    validator: PropTypes.shape({
        _id:PropTypes.shape({ 
            _str: PropTypes.string
        }),
        address: PropTypes.string,
        description:PropTypes.shape({
            moniker: PropTypes.string,
            identity: PropTypes.string,
            website: PropTypes.string,
            details: PropTypes.string,
        }),
        jailed: PropTypes.bool,
        operator_address: PropTypes.string,
        profile_url: PropTypes.string,
        status: PropTypes.string
    }),
    history: PropTypes.shape({
        length:PropTypes.number,
        action: PropTypes.string,
        location:PropTypes.shape({
            pathname: PropTypes.string,
            search: PropTypes.string,
            hash: PropTypes.string,
            key: PropTypes.string,
        }),
    }),
    stakingParams: PropTypes.shape({
        unbonding_time:PropTypes.string,
        max_validators: PropTypes.number,
        max_entries:PropTypes.number,
        bond_denom:PropTypes.string
    }),
}
