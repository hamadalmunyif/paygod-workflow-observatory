// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

contract ControlledJobRailV0 {
    error ZeroAuthorizedClient();
    error UnauthorizedCaller(address actual);
    error NonZeroValue(uint256 actual);
    error ZeroProvider();
    error JobNotFound(uint256 jobId);

    struct Job {
        address client;
        address provider;
        address evaluator;
        uint256 expiredAt;
        bytes32 descriptionHash;
        address hook;
    }

    address public immutable authorizedClient;
    uint256 public nextJobId = 1;
    mapping(uint256 => Job) private jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 expiredAt,
        bytes32 descriptionHash,
        address hook
    );

    constructor(address authorizedClient_) {
        if (authorizedClient_ == address(0)) revert ZeroAuthorizedClient();
        authorizedClient = authorizedClient_;
    }

    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external payable returns (uint256 jobId) {
        if (msg.sender != authorizedClient) revert UnauthorizedCaller(msg.sender);
        if (msg.value != 0) revert NonZeroValue(msg.value);
        if (provider == address(0)) revert ZeroProvider();

        jobId = nextJobId;
        nextJobId = jobId + 1;

        bytes32 descriptionHash = keccak256(bytes(description));
        jobs[jobId] = Job({
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            expiredAt: expiredAt,
            descriptionHash: descriptionHash,
            hook: hook
        });

        emit JobCreated(
            jobId,
            msg.sender,
            provider,
            evaluator,
            expiredAt,
            descriptionHash,
            hook
        );
    }

    function getJob(uint256 jobId)
        external
        view
        returns (
            address client,
            address provider,
            address evaluator,
            uint256 expiredAt,
            bytes32 descriptionHash,
            address hook
        )
    {
        if (jobId == 0 || jobId >= nextJobId) revert JobNotFound(jobId);
        Job storage job = jobs[jobId];
        return (
            job.client,
            job.provider,
            job.evaluator,
            job.expiredAt,
            job.descriptionHash,
            job.hook
        );
    }
}
